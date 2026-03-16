import os
from dotenv import load_dotenv

load_dotenv()

from typing import Annotated, List, TypedDict
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

# --- 1. STATE DEFINITION ---
class RAMSState(TypedDict):
    rams_text: str
    activities: List[str]
    quality_review: str
    method_review: str
    safety_review: str
    compliance_review: str
    report: str

# --- 2. INITIALIZATION ---
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GOOGLE_API_KEY"), temperature=0.2)

SYSTEM_PROMPT = """You are an experienced construction safety manager reviewing a RAMS document.

Your audience is site managers and engineers who need clear, practical feedback.

Your goal is to help improve the clarity, completeness, and practicality of the RAMS rather than criticise it.

Important tone guidelines:
- Use neutral and constructive language.
- Prefer phrases like "could be clarified", "consider specifying", or "it may help to explain".
- Avoid dramatic or accusatory language such as "dangerous", "unacceptable", or "immediate action required".
- Only identify something as a serious safety concern if the RAMS clearly lacks a critical control.

Focus on:
• clarity of the work method
• completeness of the document
• practical site safety considerations
• consistency between sections

Regulation references should be minimal and secondary to practical feedback.
"""

# --- 3. NODE FUNCTIONS ---
def analyze_node(state: RAMSState):
    """Identifies high-risk activities in the RAMS."""
    prompt = f"Analyze this RAMS and list key risk categories and activities (e.g., Excavation, Work at Height, Electrical, Lifting):\n\n{state['rams_text']}"
    response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
    return {"activities": [response.content]}

def quality_review_node(state: RAMSState):
    """Reviews document completeness and professional quality."""
    prompt = f"""Review the Document Quality of this RAMS.
Check for: Missing sections, incomplete fields, placeholders left in, spelling/clarity.
Format as a short set of observations about document quality and areas that could be clarified or improved.
Avoid overly critical language.

RAMS:
{state['rams_text']}"""
    response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
    return {"quality_review": response.content}

def method_review_node(state: RAMSState):
    """Reviews the practical work method."""
    prompt = f"""Review the Method Statement Quality of this RAMS.
Check for: Logical steps, permits mentioned, clear isolation, controlled energisation, process gaps.
Format as a short set of observations about document quality and areas that could be clarified or improved.
Avoid overly critical language.

RAMS:
{state['rams_text']}"""
    response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
    return {"method_review": response.content}

def safety_review_node(state: RAMSState):
    """Reviews operational practicality and safety."""
    prompt = f"""Review the Operational Practicality and Safety of this RAMS.
Check for: Realistic equipment, enough personnel, logical sequencing, site coordination, hazard controls.
Format as a short set of observations about document quality and areas that could be clarified or improved.
Avoid overly critical language.

RAMS:
{state['rams_text']}"""
    response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
    return {"safety_review": response.content}

def compliance_review_node(state: RAMSState):
    """Checks compliance against regulations."""
    prompt = f"""Review the Compliance of this RAMS against general health and safety regulations (e.g., CDM 2015).
Highlight any areas where legal duties may not be clearly addressed.
If the document appears broadly compliant, simply state that and suggest minor clarifications if helpful.
Avoid legalistic language unless absolutely necessary. Hide regulation numbers unless something is wrong.

RAMS:
{state['rams_text']}"""
    response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
    return {"compliance_review": response.content}

def audit_node(state: RAMSState):
    """Formats all reviews into a human-friendly summary report."""
    prompt = f"""You are a senior site manager formatting a final RAMS review report.

Your job is to produce constructive, easy-to-read feedback that helps improve the RAMS.

Tone requirements:
• Be supportive and professional.
• Focus on clarity and improvement.
• Avoid strong language such as "dangerous", "critical failure", or "unacceptable".
• Use suggestions rather than commands.

Synthesize the following reviews into a clear, structured, highly readable ONE-PAGE report.

CRITICAL INSTRUCTION: You MUST start the report EXACTLY with this format:
# RAMS Review Outcome

**Status:** [Insert Status e.g., Generally Suitable – Some Clarifications Recommended, Approved, Rejected]

**Key Areas for Review:**
• [Area 1]
• [Area 2]
• [Area 3]

After that introduction, include these sections:
2. Strengths
3. Areas That Could Be Clarified
4. Practical Improvements
5. Minor Document Improvements

Keep references to regulations secondary. Focus on site practicality.

REVIEWS TO SYNTHESIZE:
--- Quality ---
{state['quality_review']}
--- Method ---
{state['method_review']}
--- Safety ---
{state['safety_review']}
--- Compliance ---
{state['compliance_review']}
"""
    response = llm.invoke([SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=prompt)])
    return {"report": response.content}

# --- 4. GRAPH CONSTRUCTION ---
workflow = StateGraph(RAMSState)

workflow.add_node("analyze", analyze_node)
workflow.add_node("quality_review", quality_review_node)
workflow.add_node("method_review", method_review_node)
workflow.add_node("safety_review", safety_review_node)
workflow.add_node("compliance_review", compliance_review_node)
workflow.add_node("audit", audit_node)

workflow.set_entry_point("analyze")

# Parallel reviews
workflow.add_edge("analyze", "quality_review")
workflow.add_edge("analyze", "method_review")
workflow.add_edge("analyze", "safety_review")
workflow.add_edge("analyze", "compliance_review")

workflow.add_edge(["quality_review", "method_review", "safety_review", "compliance_review"], "audit")

workflow.add_edge("audit", END)

rams_app = workflow.compile()
