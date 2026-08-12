#!/usr/bin/env python3
from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from latch_platform.local_model import LocalModelConfig, LocalSemanticProvider


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def _send(self, payload):
        raw=json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("content-type","application/json")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path=="/v1/models":
            self._send({"object":"list","data":[{"id":"ibm-granite/granite-4.1-3b","object":"model"}]})
            return
        self.send_response(404); self.end_headers()

    def do_POST(self):
        if self.path!="/v1/chat/completions":
            self.send_response(404); self.end_headers(); return
        length=int(self.headers.get("content-length","0"))
        body=json.loads(self.rfile.read(length).decode("utf-8"))
        assert body["model"]=="ibm-granite/granite-4.1-3b"
        assert body["response_format"]["type"]=="json_schema"
        assert body["response_format"]["json_schema"]["strict"] is True
        prompt=json.dumps(body["messages"])
        assert "untrusted" in prompt.lower()
        assert "deterministic baseline" in prompt.lower()
        content=json.dumps({
            "actionType":"financial.commit",
            "risk":"CRITICAL",
            "reversibility":"IRREVERSIBLE",
            "confidence":0.97,
            "needsDeepReview":True,
            "promptInjectionSuspected":False,
            "reasons":["High-value non-refundable payment."],
        })
        self._send({"choices":[{"message":{"role":"assistant","content":content}}]})


def main():
    server=ThreadingHTTPServer(("127.0.0.1",0),Handler)
    port=server.server_address[1]
    thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
    try:
        provider=LocalSemanticProvider(LocalModelConfig(f"http://127.0.0.1:{port}/v1","ibm-granite/granite-4.1-3b",3))
        status=provider.status()
        assert status["healthy"] is True
        result=provider.probe()
        assert result["ok"] is True
        assert result["probePassed"] is True
        assert result["meta"]["provider"]=="local"
        assert result["result"]["risk"]=="CRITICAL"
        assert result["result"]["reversibility"]=="IRREVERSIBLE"
        print("LATCH local Granite provider smoke passed")
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=2)

if __name__=="__main__":
    main()
