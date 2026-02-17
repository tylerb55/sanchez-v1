"use client"

import { useState, useRef } from "react"
import { Upload, FileText, Save, Loader2, Trash2, AlertCircle, ArrowLeft, FileJson, FileType } from "lucide-react"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Document, Packer, Paragraph, TextRun } from "docx"
import { saveAs } from "file-saver"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export default function RAMSAuditor() {
  const [file, setFile] = useState<File | null>(null)
  const [results, setResults] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const resultsEndRef = useRef<HTMLDivElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setError(null)
      // Clear results on new upload as requested
      setResults("")
    }
  }

  const handleClear = () => {
    setFile(null)
    setResults("")
    setError(null)
    // Reset file input value
    const fileInput = document.getElementById("file-upload") as HTMLInputElement
    if (fileInput) fileInput.value = ""
  }

  const handleAudit = async () => {
    if (!file) {
      setError("Please select a file first.")
      return
    }

    setIsLoading(true)
    setError(null)
    setResults("") // Clear previous results

    try {
      const formData = new FormData()
      formData.append("file", file)

      // Assuming the backend is running on localhost:8000
      const response = await fetch("https://sanchez-v1.onrender.com/audit", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }

      if (!response.body) {
        throw new Error("No response body")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk
        
        // Process complete lines
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || "" // Keep the last incomplete chunk

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const dataStr = line.slice(6)
              const data = JSON.parse(dataStr)
              
              // Format and append the data to results
              let formattedUpdate = ""
              
              // Check which node produced the output and format accordingly
              if (data.analyze) {
                formattedUpdate = `### Analysis\n- Activities identified: ${data.analyze.activities.join(", ")}\n\n`
              } else if (data.retrieve) {
                formattedUpdate = `### CDM Requirements Retrieved\nFound ${data.retrieve.cdm_requirements.length} relevant clauses.\n\n`
              } else if (data.audit) {
                formattedUpdate = `### Audit Gaps\n${data.audit.gaps.join("\n")}\n\n`
              } else if (data.edit) {
                formattedUpdate = `### Final Report\n${data.edit.final_report}\n\n`
              } else {
                // Fallback for unknown structure
                formattedUpdate = JSON.stringify(data, null, 2) + "\n\n"
              }
              
              setResults((prev) => prev + formattedUpdate)
              
              // Auto-scroll to bottom
              setTimeout(() => {
                resultsEndRef.current?.scrollIntoView({ behavior: "smooth" })
              }, 100)
              
            } catch (e) {
              console.error("Error parsing JSON from stream:", e)
            }
          }
        }
      }
      
    } catch (err) {
      console.error("Audit failed:", err)
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async (format: "txt" | "pdf" | "docx") => {
    if (!results) return

    const filename = `rams-audit-report-${new Date().toISOString().slice(0, 10)}`

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
      <header className="mb-8 flex items-center gap-4">
        <Link href="/">
            <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
            </Button>
        </Link>
        <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">RAMS Safety Auditor</h1>
            <p className="text-muted-foreground">Upload your RAMS document for AI-powered safety auditing against CDM regulations.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto h-[calc(100vh-12rem)]">
        {/* Left Panel: Upload */}
        <Card className="lg:col-span-1 flex flex-col h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Document
            </CardTitle>
            <CardDescription>
              Select a text or PDF file to audit.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="file-upload">RAMS File</Label>
              <Input 
                id="file-upload" 
                type="file" 
                accept=".txt,.md,.pdf" 
                onChange={handleFileChange} 
                disabled={isLoading}
              />
            </div>

            {file && (
              <div className="mt-4 p-4 border rounded-md bg-muted/50 flex items-start gap-3">
                <FileText className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1 overflow-hidden">
                  <p className="font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(2)} KB</p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={handleClear}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 border border-destructive/50 rounded-md bg-destructive/10 text-destructive flex items-start gap-2 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="mt-auto pt-4">
              <Button 
                className="w-full" 
                onClick={handleAudit} 
                disabled={!file || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Auditing...
                  </>
                ) : (
                  "Start Audit"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Panel: Results */}
        <Card className="lg:col-span-2 flex flex-col h-full overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-1">
              <CardTitle className="text-xl">Audit Results</CardTitle>
              <CardDescription>
                Real-time analysis and recommendations.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={!results || isLoading}>
                    <Save className="mr-2 h-4 w-4" />
                    Save Report
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
          <CardContent className="flex-1 p-0 overflow-hidden relative">
            <ScrollArea className="h-full w-full p-6">
              {results ? (
                <div id="report-content" className="prose dark:prose-invert max-w-none text-sm p-4 bg-background">
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
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      table: ({node: _, ...props}) => <div className="overflow-x-auto my-4"><table className="w-full border-collapse text-sm" {...props} /></div>,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      thead: ({node: _, ...props}) => <thead className="bg-muted" {...props} />,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      tr: ({node: _, ...props}) => <tr className="border-b" {...props} />,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      th: ({node: _, ...props}) => <th className="text-left p-2 font-medium" {...props} />,
                      // eslint-disable-next-line @typescript-eslint/no-unused-vars
                      td: ({node: _, ...props}) => <td className="p-2 align-top" {...props} />,
                    }}
                  >
                    {results}
                  </ReactMarkdown>
                  <div ref={resultsEndRef} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p>Analyzing document...</p>
                      <div className="w-full max-w-xs space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-[80%]" />
                      </div>
                    </div>
                  ) : (
                    <>
                      <FileText className="h-16 w-16 mb-4 opacity-20" />
                      <p>Upload a file and start the audit to see results here.</p>
                    </>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
