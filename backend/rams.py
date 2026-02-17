import os
from dotenv import load_dotenv

load_dotenv()

from typing import Annotated, List, TypedDict
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langchain_community.vectorstores import Qdrant
from qdrant_client import QdrantClient, models

# --- 1. STATE DEFINITION ---
class RAMSState(TypedDict):
    rams_text: str
    activities: List[str]
    cdm_requirements: str # Combined text of relevant regulations
    gaps: List[str]
    final_report: str

# --- 3. NODE FUNCTIONS ---
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", api_key=os.getenv("GOOGLE_API_KEY"), temperature=0.1)

# Initialize Qdrant Client (Assuming local for this example)

vector_store = QdrantClient(
    url=os.getenv("QDRANT_URL"),
    api_key=os.getenv("QDRANT_API_KEY"),
    cloud_inference=True
)

def analyzer_node(state: RAMSState):
    """Identifies high-risk activities in the RAMS."""
    prompt = f"Analyze this RAMS and list key CDM risk categories (e.g., Excavation, Work at Height, Asbestos, Welfare):\n\n{state['rams_text']}"
    response = llm.invoke([SystemMessage(content="You are a Construction Safety Auditor."), HumanMessage(content=prompt)])
    # In a real app, you'd parse this into a clean list
    return {"activities": [response.content]}

def retriever_node(state: RAMSState):
    """Queries Qdrant for the relevant CDM clauses based on identified activities."""
    all_context = []
    for activity in state["activities"]:
        # Similarity search in Qdrant
        docs = vector_store.query_points(collection_name="gemini_agentic",
        query=models.Document(
        text=activity, 
        model="sentence-transformers/all-minilm-l6-v2",
    ),)
        #print(docs)
        all_context.extend([doc.payload for doc in docs.points])
    return {"cdm_requirements": all_context}

def auditor_node(state: RAMSState):
    """Compares RAMS against CDM requirements to find gaps."""
    prompt = f"""
    COMPARE RAMS AGAINST CDM REGS:
    RAMS: {state['rams_text']}
    REGS: {state['cdm_requirements']}
    
    List specific safety gaps where the RAMS fails to meet the legal requirement.
    """
    response = llm.invoke([SystemMessage(content="You are a Legal Compliance Agent."), HumanMessage(content=prompt)])
    return {"gaps": [response.content]}

def editor_node(state: RAMSState):
    """Generates the rewrite suggestions."""
    prompt = f"Based on these gaps: {state['gaps']}, write a 'Suggested Additions' section for the RAMS."
    response = llm.invoke([SystemMessage(content="You are a Safety Consultant."), HumanMessage(content=prompt)])
    return {"final_report": response.content}

# --- 4. GRAPH CONSTRUCTION ---
workflow = StateGraph(RAMSState)

workflow.add_node("analyze", analyzer_node)
workflow.add_node("retrieve", retriever_node)
workflow.add_node("audit", auditor_node)
workflow.add_node("edit", editor_node)

workflow.set_entry_point("analyze")
workflow.add_edge("analyze", "retrieve")
workflow.add_edge("retrieve", "audit")
workflow.add_edge("audit", "edit")
workflow.add_edge("edit", END)

rams_app = workflow.compile()
