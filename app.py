#!/usr/bin/env python3
"""跨境闲置物品交易平台 - 后端 API 服务"""

import json
import os
import uuid
import time
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, session, Response
from datetime import timedelta
import queue
import threading

app = Flask(__name__)
app.secret_key = os.urandom(24).hex()

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

# ── 维护模式 ──────────────────────────────────────────────────
def is_maintenance_mode():
    return os.path.exists(os.path.join(DATA_DIR, ".maintenance"))

@app.before_request
def check_maintenance():
    if not is_maintenance_mode():
        return None
    # 放行静态资源、维护页面自身、管理后台和管理API
    path = request.path
    if path.startswith("/static/") or request.endpoint in (
        "maintenance", "api_maintenance_status", "api_maintenance_toggle",
        "api_admin_login", "api_admin_check", "api_admin_products",
        "api_admin_toggle_product", "api_admin_users", "api_admin_orders_all",
        "api_admin_update_order", "admin"
    ):
        return None
    # API 请求返回 JSON 错误；页面请求跳转到维护页
    if path.startswith("/api/"):
        return jsonify({"error": "maintenance", "message": "System is under maintenance"}), 503
    # AJAX 请求不重定向
    if request.headers.get("X-Requested-With") == "XMLHttpRequest":
        return jsonify({"error": "maintenance"}), 503
    return app.redirect("/maintenance")

@app.route("/maintenance")
def maintenance():
    return render_template("maintenance.html")

@app.route("/api/maintenance/status")
def api_maintenance_status():
    return jsonify({"maintenance": is_maintenance_mode()})

@app.route("/api/maintenance/toggle", methods=["POST"])
def api_maintenance_toggle():
    if not session.get("is_admin"):
        return jsonify({"error": "unauthorized"}), 403
    data = request.get_json(silent=True) or {}
    enable = data.get("enable", False)
    flag_file = os.path.join(DATA_DIR, ".maintenance")
    if enable:
        open(flag_file, "w").close()
    else:
        if os.path.exists(flag_file):
            os.remove(flag_file)
    return jsonify({"maintenance": enable})

# ── 示例商品数据 ──────────────────────────────────────────────
SAMPLE_PRODUCTS = [
    {
        "id": "p001", "seller_id": "u001", "seller_name": "Alice (US)",
        "title_i18n": {"en": "iPhone 14 Pro 128GB - Excellent Condition", "zh": "iPhone 14 Pro 128GB - 九成新"},
        "description_i18n": {"en": "Used for 6 months, no scratches. Includes original box and charger.", "zh": "使用6个月，无划痕，含原装盒和充电器"},
        "category": "electronics", "price": 699.00, "currency": "USD",
        "condition": "like_new", "location": "New York, USA",
        "images": ["https://picsum.photos/seed/iphone14/400/400"],
        "status": "active", "created_at": "2026-05-15T08:00:00Z"
    },
    {
        "id": "p002", "seller_id": "u002", "seller_name": "Li Wei (CN)",
        "title_i18n": {"en": "Canon EOS R6 Camera Body", "zh": "佳能 EOS R6 相机机身"},
        "description_i18n": {"en": "Shutter count ~5000. Perfect for photography enthusiasts.", "zh": "快门约5000次，适合摄影爱好者"},
        "category": "electronics", "price": 1200.00, "currency": "CNY",
        "condition": "good", "location": "Shanghai, China",
        "images": ["https://picsum.photos/seed/canonr6/400/400"],
        "status": "active", "created_at": "2026-05-20T10:30:00Z"
    },
    {
        "id": "p003", "seller_id": "u003", "seller_name": "Carlos (ES)",
        "title_i18n": {"en": "Vintage Acoustic Guitar - Yamaha FG800", "zh": "复古原声吉他 - 雅马哈 FG800"},
        "description_i18n": {"en": "Well-maintained, great sound. Local pickup preferred.", "zh": "保养良好，音色出色。优先本地自取"},
        "category": "instruments", "price": 180.00, "currency": "EUR",
        "condition": "fair", "location": "Barcelona, Spain",
        "images": ["https://picsum.photos/seed/guitar/400/400"],
        "status": "active", "created_at": "2026-05-22T14:15:00Z"
    },
    {
        "id": "p004", "seller_id": "u004", "seller_name": "Yuki (JP)",
        "title_i18n": {"en": "Nintendo Switch OLED - White", "zh": "任天堂 Switch OLED - 白色"},
        "description_i18n": {"en": "Barely used, includes 3 games (Zelda, Mario Kart, Splatoon).", "zh": "几乎全新，含3款游戏（塞尔达、马车、喷射战士）"},
        "category": "electronics", "price": 32000, "currency": "JPY",
        "condition": "like_new", "location": "Tokyo, Japan",
        "images": ["https://picsum.photos/seed/switch/400/400"],
        "status": "active", "created_at": "2026-05-25T09:00:00Z"
    },
    {
        "id": "p005", "seller_id": "u005", "seller_name": "Emma (UK)",
        "title_i18n": {"en": "Designer Handbag - Coach Willow Tote", "zh": "设计师手提包 - Coach Willow 托特包"},
        "description_i18n": {"en": "Genuine leather, used twice. With dust bag and receipt.", "zh": "真皮，仅用过两次。含防尘袋和收据"},
        "category": "fashion", "price": 150.00, "currency": "GBP",
        "condition": "like_new", "location": "London, UK",
        "images": ["https://picsum.photos/seed/handbag/400/400"],
        "status": "active", "created_at": "2026-06-01T11:20:00Z"
    },
    {
        "id": "p006", "seller_id": "u006", "seller_name": "Mohammed (AE)",
        "title_i18n": {"en": "Mountain Bike - Trek Marlin 7 2025", "zh": "山地自行车 - Trek Marlin 7 2025款"},
        "description_i18n": {"en": "Size M, hydraulic disc brakes. Great for trails.", "zh": "M号，液压碟刹，适合越野"},
        "category": "sports", "price": 2500, "currency": "AED",
        "condition": "good", "location": "Dubai, UAE",
        "images": ["https://picsum.photos/seed/bike/400/400"],
        "status": "active", "created_at": "2026-06-05T16:00:00Z"
    },
    {
        "id": "p007", "seller_id": "u001", "seller_name": "Alice (US)",
        "title_i18n": {"en": "Kindle Paperwhite 11th Gen", "zh": "Kindle Paperwhite 第11代"},
        "description_i18n": {"en": "8GB, with leather case. Perfect for reading.", "zh": "8GB，含皮套。阅读神器"},
        "category": "electronics", "price": 79.00, "currency": "USD",
        "condition": "good", "location": "New York, USA",
        "images": ["https://picsum.photos/seed/kindle/400/400"],
        "status": "active", "created_at": "2026-06-08T07:30:00Z"
    },
    {
        "id": "p008", "seller_id": "u002", "seller_name": "Li Wei (CN)",
        "title_i18n": {"en": "LEGO Star Wars Millennium Falcon 75192", "zh": "乐高星球大战千年隼 75192"},
        "description_i18n": {"en": "Complete set, assembled once. 7541 pieces.", "zh": "完整套装，拼过一次。7541片"},
        "category": "toys", "price": 3800, "currency": "CNY",
        "condition": "like_new", "location": "Shanghai, China",
        "images": ["https://picsum.photos/seed/lego/400/400"],
        "status": "active", "created_at": "2026-06-10T13:45:00Z"
    },
]

# ── 数据持久化 ─────────────────────────────────────────────────
def _load_data(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None

def _save_data(filename, data):
    path = os.path.join(DATA_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def get_products():
    data = _load_data("products.json")
    if data is None:
        _save_data("products.json", SAMPLE_PRODUCTS)
        return SAMPLE_PRODUCTS
    return data

def save_products(data):
    _save_data("products.json", data)

def get_orders():
    data = _load_data("orders.json")
    return data if data else []

def save_orders(data):
    _save_data("orders.json", data)

def get_payments():
    return _load_data("payments.json") or {}

def save_payments(data):
    _save_data("payments.json", data)

def get_users():
    return _load_data("users.json") or {}

def save_users(data):
    _save_data("users.json", data)

# ── 路由 ───────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

# ── API: 商品列表 ─────────────────────────────────────────────
@app.route("/api/products")
def api_products():
    products = get_products()
    lang = request.args.get("lang", "en")
    category = request.args.get("category", "")
    keyword = request.args.get("q", "").lower()
    sort = request.args.get("sort", "newest")
    min_price = request.args.get("min_price", type=float)
    max_price = request.args.get("max_price", type=float)

    result = [p for p in products if p.get("status") == "active"]

    if category:
        result = [p for p in result if p["category"] == category]

    if keyword:
        result = [
            p for p in result
            if keyword in p.get("title_i18n", {}).get(lang, "").lower()
            or keyword in p.get("description_i18n", {}).get(lang, "").lower()
            or keyword in p.get("category", "").lower()
            or keyword in p.get("seller_name", "").lower()
        ]

    if min_price is not None:
        result = [p for p in result if p["price"] >= min_price]
    if max_price is not None:
        result = [p for p in result if p["price"] <= max_price]

    if sort == "price_asc":
        result.sort(key=lambda p: p["price"])
    elif sort == "price_desc":
        result.sort(key=lambda p: p["price"], reverse=True)
    else:
        result.sort(key=lambda p: p["created_at"], reverse=True)

    return jsonify(result)

# ── API: 商品详情 ─────────────────────────────────────────────
@app.route("/api/products/<pid>")
def api_product_detail(pid):
    products = get_products()
    for p in products:
        if p["id"] == pid:
            return jsonify(p)
    return jsonify({"error": "not found"}), 404

# ── API: 发布商品 ─────────────────────────────────────────────
@app.route("/api/products", methods=["POST"])
def api_create_product():
    try:
        data = request.get_json()
        products = get_products()
        new_product = {
            "id": "p" + uuid.uuid4().hex[:8],
            "seller_id": session.get("user_id", "guest"),
            "seller_name": session.get("display_name", "Guest User"),
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "category": data.get("category", "other"),
            "price": float(data.get("price", 0)),
            "currency": data.get("currency", "USD"),
            "condition": data.get("condition", "good"),
            "location": data.get("location", ""),
            "contact": data.get("contact", ""),
            "images": data.get("images", [data.get("image_url", "https://picsum.photos/seed/default/400/400")]),
            "videos": data.get("videos", []),
            "status": "active",
            "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        }
        products.insert(0, new_product)
        save_products(products)
        return jsonify(new_product), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# ── API: 用户注册/登录 (简化版) ────────────────────────────────
@app.route("/api/auth", methods=["POST"])
def api_auth():
    data = request.get_json()
    action = data.get("action", "login")
    users = get_users()
    email = data.get("email", "").strip()

    if action == "register":
        if email in users:
            return jsonify({"error": "email_exists"}), 400
        users[email] = {
            "id": "u" + uuid.uuid4().hex[:6],
            "email": email,
            "display_name": data.get("display_name", email.split("@")[0]),
            "password": data.get("password", ""),
            "verified_status": False,
            "reputation_score": 100,
            "preferred_currency": data.get("preferred_currency", "USD"),
            "locale": data.get("locale", "en"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        save_users(users)
        session["user_id"] = users[email]["id"]
        session["display_name"] = users[email]["display_name"]
        return jsonify(users[email])

    elif action == "login":
        user = users.get(email)
        if not user or user.get("password") != data.get("password", ""):
            return jsonify({"error": "invalid_credentials"}), 401
        session["user_id"] = user["id"]
        session["display_name"] = user["display_name"]
        return jsonify(user)

    return jsonify({"error": "unknown_action"}), 400

@app.route("/api/auth/status")
def api_auth_status():
    uid = session.get("user_id")
    if uid:
        return jsonify({"logged_in": True, "user_id": uid, "display_name": session.get("display_name")})
    return jsonify({"logged_in": False})

@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})

# ── API: 支付系统 ──────────────────────────────────────────
@app.route("/api/payment/create", methods=["POST"])
def api_payment_create():
    data = request.get_json()
    order_id = data.get("order_id")
    method = data.get("method", "card")

    orders = get_orders()
    order = next((o for o in orders if o["id"] == order_id), None)
    if not order:
        return jsonify({"error": "order_not_found"}), 404
    if order.get("payment_status") == "paid":
        return jsonify({"error": "already_paid"}), 400

    payments = get_payments()
    payment_id = "pay-" + uuid.uuid4().hex[:12]

    payment = {
        "id": payment_id,
        "order_id": order_id,
        "amount": order["snapshot_price"],
        "currency": order["currency"],
        "method": method,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    payments[payment_id] = payment
    save_payments(payments)

    return jsonify(payment), 201

@app.route("/api/payment/<payment_id>/confirm", methods=["POST"])
def api_payment_confirm(payment_id):
    payments = get_payments()
    payment = payments.get(payment_id)
    if not payment:
        return jsonify({"error": "payment_not_found"}), 404

    payment["status"] = "paid"
    payment["paid_at"] = datetime.now(timezone.utc).isoformat()
    save_payments(payments)

    # Update order payment status
    orders = get_orders()
    for o in orders:
        if o["id"] == payment["order_id"]:
            o["payment_status"] = "paid"
            o["payment_id"] = payment_id
            o["payment_method"] = payment["method"]
            o["order_status"] = "paid"
            o["updated_at"] = datetime.now(timezone.utc).isoformat()
            save_orders(orders)
            return jsonify({"payment": payment, "order": o})

    return jsonify({"error": "order_not_found"}), 404

@app.route("/api/payment/<payment_id>")
def api_payment_status(payment_id):
    payments = get_payments()
    payment = payments.get(payment_id)
    if not payment:
        return jsonify({"error": "not_found"}), 404
    return jsonify(payment)

# ── API: 下订单 ──────────────────────────────────────────────
@app.route("/api/orders", methods=["POST"])
def api_create_order():
    data = request.get_json()
    product_id = data.get("product_id")
    products = get_products()
    product = next((p for p in products if p["id"] == product_id), None)
    if not product:
        return jsonify({"error": "product_not_found"}), 404

    orders = get_orders()
    order = {
        "id": "ord-" + uuid.uuid4().hex[:10],
        "buyer_id": session.get("user_id", "guest"),
        "buyer_name": session.get("display_name", "Guest"),
        "seller_id": product["seller_id"],
        "seller_name": product["seller_name"],
        "product_id": product_id,
        "product_title": product.get("title") or product.get("title_i18n", {}).get("en", ""),
        "snapshot_price": product["price"],
        "currency": product["currency"],
        "shipping_address": data.get("shipping_address", {}),
        "tracking_number": "",
        "carrier": "",
        "order_status": "payment_pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    orders.append(order)
    save_orders(orders)
    return jsonify(order), 201

@app.route("/api/orders")
def api_orders():
    orders = get_orders()
    uid = session.get("user_id")
    if uid:
        orders = [o for o in orders if o["buyer_id"] == uid or o["seller_id"] == uid]
    orders.sort(key=lambda o: o["created_at"], reverse=True)
    return jsonify(orders)

@app.route("/api/orders/<oid>/status", methods=["PATCH"])
def api_update_order_status(oid):
    data = request.get_json()
    new_status = data.get("status")
    orders = get_orders()
    for o in orders:
        if o["id"] == oid:
            o["order_status"] = new_status
            o["updated_at"] = datetime.now(timezone.utc).isoformat()
            if "tracking_number" in data:
                o["tracking_number"] = data["tracking_number"]
            if "carrier" in data:
                o["carrier"] = data["carrier"]
            save_orders(orders)
            return jsonify(o)
    return jsonify({"error": "not_found"}), 404

# ── API: 评价 ─────────────────────────────────────────────────
def get_reviews():
    return _load_data("reviews.json") or []

def save_reviews(data):
    _save_data("reviews.json", data)

@app.route("/api/reviews", methods=["POST"])
def api_create_review():
    data = request.get_json()
    reviews = get_reviews()
    review = {
        "id": "rev-" + uuid.uuid4().hex[:8],
        "order_id": data.get("order_id"),
        "reviewer_id": session.get("user_id", "guest"),
        "reviewer_name": session.get("display_name", "Guest"),
        "target_user_id": data.get("target_user_id"),
        "rating": int(data.get("rating", 5)),
        "tags": data.get("tags", []),
        "comment": data.get("comment", ""),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    reviews.append(review)
    save_reviews(reviews)
    return jsonify(review), 201

@app.route("/api/reviews")
def api_reviews():
    target = request.args.get("target_user_id")
    reviews = get_reviews()
    if target:
        reviews = [r for r in reviews if r["target_user_id"] == target]
    reviews.sort(key=lambda r: r["created_at"], reverse=True)
    return jsonify(reviews)

# ── 汇率模拟 ──────────────────────────────────────────────────
@app.route("/api/exchange-rates")
def api_exchange_rates():
    return jsonify({
        "USD": 1.0, "CNY": 7.25, "EUR": 0.92, "GBP": 0.79,
        "JPY": 155.0, "AED": 3.67, "KRW": 1380.0, "BRL": 5.20
    })

# ── i18n 翻译 ────────────────────────────────────────────────
@app.route("/api/i18n/<lang>")
def api_i18n(lang):
    path = os.path.join(os.path.dirname(__file__), "i18n", f"{lang}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return jsonify(json.load(f))
    return jsonify({}), 404

# ══════════════════════════════════════════════════════════════
# ── 模块一: 站内即时通讯 (IM) ──
# ══════════════════════════════════════════════════════════════

SSE_CLIENTS = {}        # user_id -> queue.Queue
SSE_CLIENTS_LOCK = threading.Lock()

def _get_messages():
    return _load_data("messages.json") or []

def _save_messages(data):
    _save_data("messages.json", data)

@app.route("/api/chat/send", methods=["POST"])
def api_chat_send():
    data = request.get_json()
    sender_id = session.get("user_id", "guest")
    sender_name = session.get("display_name", "Guest")
    receiver_id = data.get("receiver_id", "")
    content = data.get("content", "").strip()
    if not receiver_id or not content:
        return jsonify({"error": "missing_fields"}), 400

    messages = _get_messages()
    msg = {
        "id": "msg-" + uuid.uuid4().hex[:10],
        "sender_id": sender_id,
        "sender_name": sender_name,
        "receiver_id": receiver_id,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    messages.append(msg)
    _save_messages(messages)

    # 推送给双方 SSE 客户端
    with SSE_CLIENTS_LOCK:
        for uid in (sender_id, receiver_id):
            q = SSE_CLIENTS.get(uid)
            if q:
                try:
                    q.put_nowait(msg)
                except queue.Full:
                    pass

    return jsonify(msg), 201

# ── 聊天消息翻译 ──
@app.route("/api/chat/translate", methods=["POST"])
def api_chat_translate():
    data = request.get_json()
    text = data.get("text", "").strip()
    target_lang = data.get("target", "en")
    if not text:
        return jsonify({"error": "empty_text"}), 400

    lang_map = {
        "zh": "zh-CN", "en": "en", "ja": "ja", "ko": "ko",
        "fr": "fr", "de": "de", "es": "es", "pt": "pt",
        "ru": "ru", "ar": "ar", "hi": "hi", "it": "it"
    }
    dt_lang = lang_map.get(target_lang, target_lang)

    # 检测源语言
    src_lang = "en"
    try:
        from langdetect import detect
        detected = detect(text)
        # 中文统一
        if detected in ("zh-cn", "zh-tw", "zh"):
            detected = "zh"
        src_lang = lang_map.get(detected, detected)
    except Exception:
        pass

    # 如果源语言和目标语言相同，不翻译
    if src_lang == dt_lang:
        return jsonify({"translated": text, "text": text, "target": target_lang, "same": True}), 200

    # 尝试 MyMemory 免费 API
    try:
        import requests
        params = {"q": text, "langpair": f"{src_lang}|{dt_lang}", "mt": "1"}
        resp = requests.get("https://api.mymemory.translated.net/get", params=params, timeout=8)
        if resp.status_code == 200:
            data_resp = resp.json()
            if data_resp.get("responseStatus") == 200:
                return jsonify({"translated": data_resp["responseData"]["translatedText"], "text": text, "target": target_lang}), 200
    except Exception:
        pass

    # 回退：deep-translator
    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(source="auto", target=dt_lang).translate(text)
        return jsonify({"translated": translated, "text": text, "target": target_lang}), 200
    except Exception:
        pass

    return jsonify({"translated": text, "text": text, "target": target_lang, "note": "unavailable"}), 200

@app.route("/api/chat/stream")
def api_chat_stream():
    user_id = session.get("user_id", "guest")
    q = queue.Queue(maxsize=30)
    with SSE_CLIENTS_LOCK:
        SSE_CLIENTS[user_id] = q

    def generate():
        try:
            while True:
                try:
                    msg = q.get(timeout=25)
                    yield f"data: {json.dumps(msg)}\n\n"
                except queue.Empty:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        except GeneratorExit:
            pass
        finally:
            with SSE_CLIENTS_LOCK:
                SSE_CLIENTS.pop(user_id, None)

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.route("/api/chat/history")
def api_chat_history():
    user_id = session.get("user_id", "guest")
    other_id = request.args.get("with", "")
    if not other_id:
        return jsonify([])
    messages = _get_messages()
    msgs = [m for m in messages if
            (m["sender_id"] == user_id and m["receiver_id"] == other_id) or
            (m["sender_id"] == other_id and m["receiver_id"] == user_id)]
    msgs.sort(key=lambda m: m["created_at"])
    return jsonify(msgs)

@app.route("/api/chat/conversations")
def api_chat_conversations():
    user_id = session.get("user_id", "guest")
    messages = _get_messages()
    partners = {}
    for m in messages:
        partner = None
        partner_name = ""
        if m["sender_id"] == user_id:
            partner = m["receiver_id"]
            partner_name = m.get("receiver_name", partner)
        elif m["receiver_id"] == user_id:
            partner = m["sender_id"]
            partner_name = m.get("sender_name", partner)
        else:
            continue
        if partner not in partners or m["created_at"] > partners[partner]["last_time"]:
            partners[partner] = {
                "user_id": partner,
                "name": partner_name,
                "last_msg": m["content"][:60],
                "last_time": m["created_at"]
            }
    return jsonify(sorted(partners.values(), key=lambda x: x["last_time"], reverse=True))

# ══════════════════════════════════════════════════════════════
# ── 模块二: 物流追踪 API ──
# ══════════════════════════════════════════════════════════════

def _get_logistics():
    return _load_data("logistics.json") or {}

def _save_logistics(data):
    _save_data("logistics.json", data)

def _generate_tracking_events(order_id, carrier):
    """为订单生成模拟物流节点"""
    now = datetime.now(timezone.utc)
    carrier_nodes = {
        "DHL":  ["DHL Express Hub (Origin)",     "DHL International Gateway",   "DHL Local Delivery Facility"],
        "FedEx":["FedEx Origin Sort Facility",    "FedEx International Hub",      "FedEx Destination Station"],
        "USPS": ["USPS Regional Origin Facility", "USPS International Center",   "USPS Local Post Office"],
        "EMS":  ["EMS Processing Center",         "EMS International Exchange",  "EMS Delivery Office"],
    }
    nodes = carrier_nodes.get(carrier, carrier_nodes["DHL"])

    events = [
        {"status": "order_confirmed",      "location": "Order System",       "timestamp": now.isoformat(),                                                "message": "Order confirmed, waiting for package pickup."},
        {"status": "picked_up",            "location": nodes[0],              "timestamp": (now + timedelta(hours=3)).isoformat(),                         "message": "Package picked up by carrier."},
        {"status": "processing",           "location": nodes[0],              "timestamp": (now + timedelta(hours=6)).isoformat(),                         "message": "Package processed at origin facility."},
        {"status": "customs_export",       "location": "Customs (Export)",   "timestamp": (now + timedelta(days=1)).isoformat(),                           "message": "Package cleared export customs."},
        {"status": "international_transit","location": nodes[1],              "timestamp": (now + timedelta(days=3)).isoformat(),                           "message": "Package in international transit."},
        {"status": "customs_import",       "location": "Customs (Import)",   "timestamp": (now + timedelta(days=5)).isoformat(),                           "message": "Package arrived at destination customs."},
        {"status": "local_sorting",        "location": nodes[2],              "timestamp": (now + timedelta(days=6)).isoformat(),                           "message": "Package at local sorting facility."},
        {"status": "out_for_delivery",     "location": "Delivery Vehicle",   "timestamp": (now + timedelta(days=6, hours=5)).isoformat(),                  "message": "Package out for delivery."},
        {"status": "delivered",            "location": "Destination Address","timestamp": (now + timedelta(days=7)).isoformat(),                            "message": "Package delivered successfully."},
    ]
    return events

@app.route("/api/logistics/<order_id>")
def api_logistics(order_id):
    logistics = _get_logistics()
    if order_id not in logistics:
        orders = get_orders()
        order = next((o for o in orders if o["id"] == order_id), None)
        if order and order.get("tracking_number"):
            events = _generate_tracking_events(order_id, order.get("carrier", "DHL"))
            logistics[order_id] = {
                "tracking_number": order["tracking_number"],
                "carrier": order.get("carrier", "DHL"),
                "events": events,
                "current_status": events[0]["status"]
            }
            _save_logistics(logistics)
        else:
            return jsonify({"error": "no_tracking"}), 404
    return jsonify(logistics[order_id])

@app.route("/api/logistics/<order_id>/refresh", methods=["POST"])
def api_logistics_refresh(order_id):
    """重新生成物流数据（模拟刷新）"""
    orders = get_orders()
    order = next((o for o in orders if o["id"] == order_id), None)
    if not order or not order.get("tracking_number"):
        return jsonify({"error": "no_tracking"}), 404
    logistics = _get_logistics()
    events = _generate_tracking_events(order_id, order.get("carrier", "DHL"))
    logistics[order_id] = {
        "tracking_number": order["tracking_number"],
        "carrier": order.get("carrier", "DHL"),
        "events": events,
        "current_status": events[0]["status"]
    }
    _save_logistics(logistics)
    return jsonify(logistics[order_id])

# ══════════════════════════════════════════════════════════════
# ── 模块三: 商品图片 OCR 识别分类 ──
# ══════════════════════════════════════════════════════════════

import hashlib
import mimetypes

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
ALLOWED_VIDEO = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
ALLOWED_EXTENSIONS = ALLOWED_IMAGE | ALLOWED_VIDEO
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB

@app.route("/api/upload", methods=["POST"])
def api_upload():
    """上传图片/视频文件，返回访问 URL 列表"""
    if "files" not in request.files:
        return jsonify({"error": "no_files"}), 400

    uploaded = []
    errors = []

    for f in request.files.getlist("files"):
        if not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            errors.append({"filename": f.filename, "error": f"unsupported_format: {ext}"})
            continue

        safe_name = hashlib.md5((f.filename + str(time.time())).encode()).hexdigest()[:12] + ext
        save_path = os.path.join(UPLOAD_DIR, safe_name)

        # 检查文件大小
        f.seek(0, 2)
        size = f.tell()
        f.seek(0)
        if size > MAX_UPLOAD_SIZE:
            errors.append({"filename": f.filename, "error": "file_too_large"})
            continue

        f.save(save_path)
        mime_type = mimetypes.guess_type(save_path)[0] or "application/octet-stream"
        is_video = ext in ALLOWED_VIDEO
        uploaded.append({
            "url": f"/static/uploads/{safe_name}",
            "filename": safe_name,
            "original_name": f.filename,
            "type": mime_type,
            "is_video": is_video,
            "size_bytes": size
        })

    return jsonify({"files": uploaded, "errors": errors}), 200 if uploaded else 400

@app.route("/api/ocr/analyze", methods=["POST"])
def api_ocr_analyze():
    """分析图片: 接受 URL 或文件上传, 返回模拟 OCR 结果 + 分类建议"""
    result = {
        "category": "other",
        "confidence": 0.7,
        "suggested_title": "",
        "detected_text": "",
        "image_info": {}
    }

    # 方式一: 传入图片 URL
    image_url = request.form.get("image_url", "")
    if image_url:
        try:
            import urllib.request as urlreq
            resp = urlreq.urlopen(image_url, timeout=10)
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            size = int(resp.headers.get("Content-Length", 0))
            result["image_info"] = {"url": image_url, "type": content_type, "size_bytes": size}
        except Exception as e:
            result["image_info"] = {"url": image_url, "error": str(e)}

    # 方式二: 直接上传文件
    if "file" in request.files:
        f = request.files["file"]
        if f.filename:
            ext = os.path.splitext(f.filename)[1].lower()
            safe_name = hashlib.md5(f.filename.encode()).hexdigest()[:12] + ext
            save_path = os.path.join(UPLOAD_DIR, safe_name)
            f.save(save_path)
            size = os.path.getsize(save_path)
            mime_type = mimetypes.guess_type(save_path)[0] or "unknown"
            result["image_info"] = {"filename": safe_name, "type": mime_type, "size_bytes": size, "path": f"/static/uploads/{safe_name}"}

    # 基于文件名/URL 做启发式分类
    info = result["image_info"]
    hint = (info.get("url", "") + info.get("filename", "")).lower()
    if any(kw in hint for kw in ["phone", "iphone", "samsung", "pixel", "laptop", "macbook", "camera", "headphone", "watch", "tablet", "kindle"]):
        result["category"] = "electronics"
        result["confidence"] = 0.85
    elif any(kw in hint for kw in ["bag", "shoe", "dress", "watch", "jacket", "sneaker", "handbag"]):
        result["category"] = "fashion"
        result["confidence"] = 0.80
    elif any(kw in hint for kw in ["guitar", "piano", "drum", "violin", "keyboard"]):
        result["category"] = "instruments"
        result["confidence"] = 0.82
    elif any(kw in hint for kw in ["bike", "bicycle", "tent", "yoga", "dumbbell", "soccer", "ball"]):
        result["category"] = "sports"
        result["confidence"] = 0.80
    elif any(kw in hint for kw in ["lego", "toy", "doll", "figure", "puzzle", "boardgame"]):
        result["category"] = "toys"
        result["confidence"] = 0.83

    if result["category"] != "other":
        cat_names = {"electronics": "Electronics", "fashion": "Fashion", "instruments": "Musical Instruments",
                     "sports": "Sports & Outdoors", "toys": "Toys & Hobbies"}
        result["suggested_title"] = f"[{cat_names[result['category']]}] Item from image"
        result["detected_text"] = f"Auto-detected category: {cat_names[result['category']]} (confidence: {result['confidence']:.0%})"

    result["_note"] = "OCR 分类基于文件名/URL 启发式匹配。安装 tesseract-ocr + pytesseract 后可启用真实 OCR 文本识别。"
    return jsonify(result)

# ══════════════════════════════════════════════════════════════
# ── 模块四: 后台管理面板 ──
# ══════════════════════════════════════════════════════════════

ADMIN_PASSWORD = "admin888"

@app.route("/admin")
def admin_panel():
    return render_template("admin.html")

@app.route("/api/admin/stats")
def api_admin_stats():
    products = get_products()
    orders = get_orders()
    users = get_users()
    reviews = _load_data("reviews.json") or []
    messages = _get_messages()

    total_value = sum(p["price"] for p in products)
    total_orders_value = sum(o["snapshot_price"] for o in orders if o["order_status"] != "payment_pending")

    return jsonify({
        "total_products": len(products),
        "active_products": len([p for p in products if p.get("status") == "active"]),
        "total_users": len(users),
        "total_orders": len(orders),
        "completed_orders": len([o for o in orders if o["order_status"] == "completed"]),
        "pending_orders": len([o for o in orders if o["order_status"] == "payment_pending"]),
        "total_reviews": len(reviews),
        "total_messages": len(messages),
        "total_product_value": round(total_value, 2),
        "total_orders_value": round(total_orders_value, 2),
        "orders_by_status": {
            status: len([o for o in orders if o["order_status"] == status])
            for status in ["payment_pending", "paid", "shipped", "delivered", "completed", "disputed"]
        },
        "products_by_category": {
            cat: len([p for p in products if p["category"] == cat])
            for cat in ["electronics", "fashion", "instruments", "sports", "toys", "other"]
        }
    })

@app.route("/api/admin/auth", methods=["POST"])
def api_admin_auth():
    data = request.get_json()
    pwd = data.get("password", "")
    print(f"[Admin Auth] received password: '{pwd}' (len={len(pwd)}), expected: '{ADMIN_PASSWORD}' (len={len(ADMIN_PASSWORD)})", flush=True)
    if pwd == ADMIN_PASSWORD:
        session["is_admin"] = True
        return jsonify({"ok": True})
    return jsonify({"error": "invalid_password"}), 401

@app.route("/api/admin/check")
def api_admin_check():
    return jsonify({"is_admin": session.get("is_admin", False)})

@app.route("/api/admin/products")
def api_admin_products():
    if not session.get("is_admin"): return jsonify({"error": "unauthorized"}), 403
    products = get_products()
    return jsonify(sorted(products, key=lambda p: p["created_at"], reverse=True))

@app.route("/api/admin/products/<pid>/toggle", methods=["PATCH"])
def api_admin_toggle_product(pid):
    if not session.get("is_admin"): return jsonify({"error": "unauthorized"}), 403
    products = get_products()
    for p in products:
        if p["id"] == pid:
            p["status"] = "inactive" if p.get("status") == "active" else "active"
            save_products(products)
            return jsonify(p)
    return jsonify({"error": "not_found"}), 404

@app.route("/api/admin/users")
def api_admin_users():
    if not session.get("is_admin"): return jsonify({"error": "unauthorized"}), 403
    users = get_users()
    return jsonify([{"email": k, **v} for k, v in users.items()])

@app.route("/api/admin/orders/all")
def api_admin_orders_all():
    if not session.get("is_admin"): return jsonify({"error": "unauthorized"}), 403
    orders = get_orders()
    return jsonify(sorted(orders, key=lambda o: o["created_at"], reverse=True))

@app.route("/api/admin/orders/<oid>/status", methods=["PATCH"])
def api_admin_update_order(oid):
    if not session.get("is_admin"): return jsonify({"error": "unauthorized"}), 403
    data = request.get_json()
    orders = get_orders()
    for o in orders:
        if o["id"] == oid:
            o["order_status"] = data.get("status", o["order_status"])
            o["updated_at"] = datetime.now(timezone.utc).isoformat()
            save_orders(orders)
            return jsonify(o)
    return jsonify({"error": "not_found"}), 404

# ── 启动 ─────────────────────────────────────────────────────
if __name__ == "__main__":
    print("跨境闲置物品交易平台启动: http://0.0.0.0:8080")
    print("管理后台: http://0.0.0.0:8080/admin")
    app.run(host="0.0.0.0", port=8080, debug=True)
