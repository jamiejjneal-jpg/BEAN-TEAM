from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="PawTrail API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def api_health():
    return {"status": "ok", "service": "PawTrail Backend"}

# Bare /health for Kubernetes / Emergent deployment health probes
@app.get("/health")
async def root_health():
    return {"status": "ok"}
