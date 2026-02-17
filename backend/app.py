from fastapi import FastAPI, UploadFile, Form, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from rams import rams_app
from daily_reporting import daily_report_app
import json
import base64

import tempfile
import shutil
import os
from helpers import parse_pdf_to_markdown

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/audit")
async def audit_rams(file: UploadFile):
    # 1. Read and parse the uploaded file (PDF/MD)
    if file.filename.endswith(".pdf"):
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name
        
        try:
            docs = parse_pdf_to_markdown(tmp_path)
            rams_text = "\n".join([d.page_content for d in docs])
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    else:
        content = await file.read()
        rams_text = content.decode("utf-8")
    
    # 2. Define the generator for streaming
    async def event_generator():
        # Using the LangGraph 'app' we built
        async for event in rams_app.astream(
            {"rams_text": rams_text}, 
            stream_mode="updates" # Streams as each node finishes
        ):
            # Only stream the last 2 nodes (audit and edit)
            if "audit" in event or "edit" in event:
                yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.post("/reporting")
async def reporting(
    report_text: str = Form(""),
    file: UploadFile = File(None)
):
    image_data = None
    image_mime = None
    pdf_text = ""

    if file:
        if file.filename.lower().endswith(".pdf"):
             with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                shutil.copyfileobj(file.file, tmp)
                tmp_path = tmp.name
            
             try:
                docs = parse_pdf_to_markdown(tmp_path)
                pdf_text = "\n".join([d.page_content for d in docs])
             finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
        else:
            content = await file.read()
            image_data = base64.b64encode(content).decode("utf-8")
            image_mime = file.content_type

    final_report_text = f"{report_text}\n\n{pdf_text}".strip()

    async def event_generator():
        async for event in daily_report_app.astream(
            {
                "report_text": final_report_text,
                "image_data": image_data,
                "image_mime": image_mime,
                "summary": "",
                "issues": [],
                "adjustments": ""
            },
            stream_mode="updates"
        ):
            if "summarize" in event or "estimate" in event:
                yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")