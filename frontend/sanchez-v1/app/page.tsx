import Link from "next/link"
import { ClipboardList, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Site Management Tools</h1>
          <p className="text-xl text-muted-foreground">
            Select a tool to manage your construction project safety and reporting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* RAMS Auditor Card */}
          <Link href="/rams-audit" className="block group">
            <Card className="h-full transition-all hover:border-primary hover:shadow-md cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl group-hover:text-primary transition-colors">
                  <ShieldCheck className="h-8 w-8" />
                  RAMS Safety Auditor
                </CardTitle>
                <CardDescription className="text-base">
                  AI-powered auditing of Risk Assessment and Method Statements against CDM regulations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Upload PDF or text documents to identify safety gaps, retrieve relevant regulations, and generate compliance reports.
                </p>
                <Button className="w-full">Open Auditor</Button>
              </CardContent>
            </Card>
          </Link>

          {/* Daily Report Card */}
          <Link href="/daily-report" className="block group">
            <Card className="h-full transition-all hover:border-primary hover:shadow-md cursor-pointer">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl group-hover:text-primary transition-colors">
                  <ClipboardList className="h-8 w-8" />
                  Site Daily Report
                </CardTitle>
                <CardDescription className="text-base">
                  Capture daily site activities, voice notes, and photos for automated reporting.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Record site progress, log issues like weather or shortages, and get instant time/cost impact analysis from our agent.
                </p>
                <Button className="w-full">Create Report</Button>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
