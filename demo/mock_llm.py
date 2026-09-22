# 假 LLM 服务器：OpenAI 兼容 /chat/completions，用于端到端测试插件的 LLM 管线。
# 按提示词内容返回合理的 JSON（模拟一个真模型的应答）。
import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer

FIELD_RULES = [
    ("你叫什么名字", "basic.name"),
    ("用什么找到", "basic.phone"),
    ("坠地", "basic.birth_date"),
    ("英语水平", "edu.english_level"),
]

SUB_RULES = [
    ("单位", "org"),
    ("描述", "description"),
    ("内容", "description"),
]


def handle_prompt(system, user):
    # 0) AI 兜底填空：从简历数据里挑值
    if "最合适的填写值" in (system or ""):
        canned = {
            "工作经验": "应届毕业生（2027届）",
            "最近公司": "暂无",
            "期望城市": "北京",
            "个人资料": "详见附件简历",
        }
        fills = []
        for m in re.finditer(r"key=(\w+) label=「([^」]*)」", user):
            key, label = m.group(1), m.group(2)
            for kw, val in canned.items():
                if kw in label:
                    fills.append({"key": key, "value": val})
                    break
        return {"fills": fills}

    # 1) 顶层字段映射
    if "表单字段" in user and "mappings" not in user:
        mappings = []
        for m in re.finditer(r"key=(\w+) label=「([^」]*)」", user):
            key, label = m.group(1), m.group(2)
            for kw, path in FIELD_RULES:
                if kw in label:
                    mappings.append({"key": key, "path": path})
                    break
        return {"mappings": mappings, "unmatched": []}

    # 2) 重复段落主题认领
    if "简历列表键" in user:
        if "社会实践" in user:
            return {"key": "social_practice"}
        return {"key": None}

    # 3) 段落子字段映射
    if "条目子键" in user:
        mappings = []
        for m in re.finditer(r"key=(\w+) label=「([^」]*)」", user):
            key, label = m.group(1), m.group(2)
            for kw, sub in SUB_RULES:
                if kw in label:
                    mappings.append({"key": key, "sub": sub})
                    break
        return {"mappings": mappings, "unmatched": []}

    # 4) 选项挑拣（CET6 → 大学英语六级(CET-6)）
    if "选项列表" in user:
        m = re.search(r"目标值:\s*(.+)\s*选项列表:\s*(.+)", user, re.S)
        if m:
            value = m.group(1).strip()
            opts = re.findall(r"[\"']([^\"']+)[\"']", m.group(2))
            v = value.replace("-", "").replace("－", "").lower()
            for o in opts:
                if v in o.replace("-", "").lower():
                    return {"choice": o}
        return {"choice": None}

    return {"ok": True}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "*")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n))
        msgs = body.get("messages", [])
        system = next((m["content"] for m in msgs if m.get("role") == "system"), "")
        user = next((m["content"] for m in msgs if m.get("role") == "user"), "")
        content = json.dumps(handle_prompt(system, user), ensure_ascii=False)
        resp = json.dumps(
            {"choices": [{"message": {"role": "assistant", "content": content}}]}
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    print("mock LLM listening on http://127.0.0.1:8766/v1")
    HTTPServer(("127.0.0.1", 8766), Handler).serve_forever()
