import os
from typing import Annotated, List, TypedDict, Optional
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
import base64

# --- 1. STATE DEFINITION ---
class DailyReportState(TypedDict):
    report_text: str
    image_data: Optional[str] # Base64 encoded image
    image_mime: Optional[str]
    summary: str
    issues: List[str]
    adjustments: str

# --- 2. INITIALIZE LLM ---
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GOOGLE_API_KEY"), temperature=0.1)

# --- 3. NODE FUNCTIONS ---

def analyzer_node(state: DailyReportState):
    """Analyzes the report text and image for issues."""
    
    prompt_text = f"""
    Analyze the following daily site report and attached image (if any).
    Identify any issues that require attention, such as:
    - Absentees
    - Bad weather
    - Injuries or accidents
    - Material shortages
    - Delays
    
    Report Text: {state['report_text']}
    """
    
    messages = [
        SystemMessage(content="You are a Construction Site Manager Assistant. Your job is to flag critical issues."),
        HumanMessage(content=[
            {"type": "text", "text": prompt_text},
        ])
    ]
    
    if state.get("image_data"):
        mime_type = state.get("image_mime", "image/jpeg")
        messages[0].content += " An image has been provided for context."
        messages[1].content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{state['image_data']}"}
        })

    response = llm.invoke(messages)
    
    # Simple parsing for now - in a real app, use structured output
    return {"issues": [response.content]}

def summarizer_node(state: DailyReportState):
    """Summarizes the day's events."""
    prompt = f"""
    Summarize the daily report into a concise paragraph for the project dashboard.
    
    Report: {state['report_text']}
    Issues Identified: {state['issues']}
    """
    response = llm.invoke([SystemMessage(content="You are a Project Administrator."), HumanMessage(content=prompt)])
    return {"summary": response.content}

def estimator_node(state: DailyReportState):
    """Estimates time and cost adjustments based on issues."""
    prompt = f"""
    Based on the identified issues, estimate the potential time and cost impact for the current project.
    If no issues, state that the project is on track.
    
    Issues: {state['issues']}
    """
    response = llm.invoke([SystemMessage(content="You are a Quantity Surveyor."), HumanMessage(content=prompt)])
    return {"adjustments": response.content}

# --- 4. GRAPH CONSTRUCTION ---
workflow = StateGraph(DailyReportState)

workflow.add_node("analyze", analyzer_node)
workflow.add_node("summarize", summarizer_node)
workflow.add_node("estimate", estimator_node)

workflow.set_entry_point("analyze")
workflow.add_edge("analyze", "summarize")
workflow.add_edge("summarize", "estimate")
workflow.add_edge("estimate", END)

daily_report_app = workflow.compile()
