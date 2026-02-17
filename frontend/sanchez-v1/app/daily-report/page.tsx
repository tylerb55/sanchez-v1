"use client"

import { useState, useRef, useEffect } from "react"
import { Mic, MicOff, Send, FileText, Loader2, AlertCircle, CheckCircle2, ArrowLeft, Save, FileJson, FileType } from "lucide-react"
import { Button } from "@/components/ui/button"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Document, Packer, Paragraph, TextRun } from "docx"
import { saveAs } from "file-saver"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu"

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  length: number;
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognition };
    webkitSpeechRecognition: { new (): SpeechRecognition };
  }
}

export default function DailyReportPage() {
  const [reportText, setReportText] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [results, setResults] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const resultsEndRef = useRef<HTMLDivElement>(null)

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        
        recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
          // Append to existing text or replace? Appending is safer for continuous dictation.
          // However, interim results can be tricky. Let's just use final results for simplicity if possible,
          // but for real-time feel we want interim.
          // A simple approach: update text with current transcript.
          // Better: just append the NEW transcript to the END of the current text.
          // Actually, let's just use the final results to append.
           if (event.results[event.resultIndex].isFinal) {
              setReportText(prev => prev + " " + event.results[event.resultIndex][0].transcript)
           }
        }

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          if (event.error === 'no-speech') {
            console.log("No speech detected. Keeping the microphone open.")
            // Don't stop recording, just ignore or maybe show a toast
            return
          }
          console.error("Speech recognition error", event.error)
          setIsRecording(false)
        }

        recognitionRef.current.onend = () => {
             // If we are supposed to be recording, restart it
             if (isRecordingRef.current) {
                 try {
                    recognitionRef.current?.start()
                 } catch {
                     // ignore if already started
                 }
             }
        }
      }
    }
  }, [])

  const isRecordingRef = useRef(false) // Use ref to track recording state in event handlers

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      setError("Speech recognition is not supported in this browser.")
      return
    }

    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      isRecordingRef.current = false
    } else {
      try {
        recognitionRef.current?.start()
        setIsRecording(true)
        isRecordingRef.current = true
        setError(null)
      } catch (err) {
        console.error("Failed to start recording:", err)
      }
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0])
    }
  }

  const handleSubmit = async () => {
    if (!reportText && !imageFile) {
      setError("Please provide a report text or upload an image.")
      return
    }

    setIsSubmitting(true)
    setError(null)
    setResults("")

    try {
      const formData = new FormData()
      formData.append("report_text", reportText)
      if (imageFile) {
        formData.append("file", imageFile)
      }

      const response = await fetch("http://localhost:8000/reporting", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }

      if (!response.body) throw new Error("No response body")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6))
              let formattedUpdate = ""

              if (data.analyze) {
                 // The analyze node returns 'issues' which is a list of strings (from LLM)
                 // It might be a single string containing a list, or a list of strings.
                 // The backend code: return {"issues": [response.content]}
                 // So data.analyze.issues is [ "string content" ]
                 formattedUpdate = `### 🚩 Analysis & Issues\n${data.analyze.issues[0]}\n\n`
              } else if (data.summarize) {
                 formattedUpdate = `### 📝 Daily Summary\n${data.summarize.summary}\n\n`
              } else if (data.estimate) {
                 formattedUpdate = `### 💰 Time & Cost Adjustments\n${data.estimate.adjustments}\n\n`
              }

              setResults(prev => prev + formattedUpdate)
              
              // Auto-scroll
              setTimeout(() => {
                  resultsEndRef.current?.scrollIntoView({ behavior: "smooth" })
              }, 100)

            } catch (e) {
              console.error("Error parsing stream:", e)
            }
          }
        }
      }

    } catch (err) {
      console.error("Reporting failed:", err)
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSave = async (format: "txt" | "pdf" | "docx") => {
    if (!results) return

    const filename = `daily-report-${new Date().toISOString().slice(0, 10)}`

    try {
      if (format === "txt") {
        const blob = new Blob([results], { type: "text/plain;charset=utf-8" })
        saveAs(blob, `${filename}.txt`)
      } else if (format === "docx") {
        const doc = new Document({
          sections: [
            {
              children: results.split("\n").map(line => 
                new Paragraph({
                  children: [new TextRun(line)],
                })
              ),
            },
          ],
        })
        const blob = await Packer.toBlob(doc)
        saveAs(blob, `${filename}.docx`)
      }
    } catch (err) {
      console.error("Save failed:", err)
      setError("Failed to save file.")
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Link href="/">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Site Daily Report</h1>
                    <p className="text-muted-foreground">Record daily activities, issues, and progress.</p>
                </div>
            </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <Card className="flex flex-col h-full">
            <CardHeader>
              <CardTitle>New Report</CardTitle>
              <CardDescription>Speak or type your daily observations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              
              <div className="relative">
                <Textarea 
                  placeholder="Describe the day's events, any issues, weather conditions, etc..." 
                  className="min-h-[200px] pr-12 resize-none"
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  disabled={isSubmitting}
                />
                <Button 
                  variant={isRecording ? "destructive" : "secondary"}
                  size="icon" 
                  className={`absolute bottom-3 right-3 rounded-full transition-all ${isRecording ? "animate-pulse" : ""}`}
                  onClick={toggleRecording}
                  disabled={isSubmitting}
                  title={isRecording ? "Stop Recording" : "Start Voice Recording"}
                >
                  {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="image-upload">Attach Photo (Optional)</Label>
                <div className="flex items-center gap-2">
                    <Input 
                        id="image-upload" 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageChange}
                        disabled={isSubmitting}
                        className="flex-1"
                    />
                </div>
                {imageFile && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" /> 
                        {imageFile.name} attached
                    </p>
                )}
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 text-destructive rounded-md flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

            </CardContent>
            <CardFooter>
              <Button 
                className="w-full" 
                onClick={handleSubmit} 
                disabled={isSubmitting || (!reportText && !imageFile)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing Report...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Report
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Results Section */}
          <Card className="flex flex-col h-full border-l-4 border-l-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Agent Analysis</CardTitle>
                    <CardDescription>Real-time feedback and project impact assessment.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={!results || isSubmitting}>
                                <Save className="mr-2 h-4 w-4" />
                                Save
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleSave("docx")}>
                                <FileType className="mr-2 h-4 w-4" />
                                Save as Word (DOCX)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleSave("txt")}>
                                <FileJson className="mr-2 h-4 w-4" />
                                Save as Text (TXT)
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <Separator />
            <CardContent className="flex-1 p-0 relative min-h-[300px]">
               <ScrollArea className="h-full w-full p-6 max-h-[600px]">
                {results ? (
                    <div id="report-results" className="prose dark:prose-invert max-w-none text-sm p-4 bg-background">
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={{
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            h1: ({node: _, ...props}) => <h1 className="text-xl font-bold mt-6 mb-4" {...props} />,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            h2: ({node: _, ...props}) => <h2 className="text-lg font-bold mt-5 mb-3" {...props} />,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            h3: ({node: _, ...props}) => <h3 className="text-base font-bold mt-4 mb-2" {...props} />,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            ul: ({node: _, ...props}) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            ol: ({node: _, ...props}) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            li: ({node: _, ...props}) => <li className="mb-1" {...props} />,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            p: ({node: _, ...props}) => <p className="mb-4 leading-relaxed" {...props} />,
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            blockquote: ({node: _, ...props}) => <blockquote className="border-l-4 border-primary/20 pl-4 italic my-4" {...props} />,
                          }}
                        >
                            {results}
                        </ReactMarkdown>
                        <div ref={resultsEndRef} />
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center opacity-50">
                        {isSubmitting ? (
                            <div className="space-y-4">
                                <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                                <p>Analyzing report data...</p>
                            </div>
                        ) : (
                            <>
                                <FileText className="h-12 w-12 mb-3 mx-auto" />
                                <p>Submit a report to see agent analysis here.</p>
                            </>
                        )}
                    </div>
                )}
               </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
