�import json
import random
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

TOKEN = "7512352068:AAGSvO1zy6vHXd3DPJNp9LzD6BAaq-Iml2U"

# Загрузка данных из JSON
with open("meanings_with_daily_full.json", "r", encoding="utf-8") as f:
    cards = json.load(f)

# Базовый путь к онлайн-изображениям (на GitHub)
IMAGE_BASE_URL = "https://raw.githubusercontent.com/ekelen/tarot-api/master/images/"

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🔮 Привет! Напиши /card чтобы вытянуть карту Таро.")

    await update.message.reply_text("🔄 Вы тянете карту Таро...")
async def card(update: Update, context: ContextTypes.DEFAULT_TYPE):
    card_name = random.choice(list(cards.keys()))
    card = cards[card_name]

    is_reversed = random.choice([True, False])
    position = "перевернутая" if is_reversed else "прямая"
    meaning = card["reversed"] if is_reversed else card["upright"]
    daily = card["daily_reversed"] if is_reversed else card["daily_upright"]
    image_url = IMAGE_BASE_URL + card["image"]

    caption = f"🃏 *{card_name}* ({position})\n\n_{meaning}_\n\n{daily}"

    await update.message.reply_photo(
        photo=image_url,
        caption=caption,
        parse_mode="Markdown"
    )

if __name__ == "__main__":
    app = ApplicationBuilder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("card", card))
    app.run_polling()

import logging
logging.basicConfig(level=logging.DEBUG)
� ��
�� ����2-file:///c:/Users/Admin/Documents/tarot/bot.py