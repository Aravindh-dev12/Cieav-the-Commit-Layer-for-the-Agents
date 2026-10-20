"""
CIEAV Sovereign Multilingual Intelligence Engine (100% Local • Zero Cloud APIs).
=============================================================================
Enables universal natural language comprehension and localized responses across:
- Hindi (हिन्दी / Hinglish)
- Telugu (తెలుగు)
- Kannada (ಕನ್ನಡ)
- Malayalam (മലയാളം)
- French (Français)
- Arabic (العربية)
- Chinese (中文)
- Japanese (日本語)
- Spanish (Español)
- English (Global Default)

Normalizes international queries to atomic CIEAV tool operations and replies
in the user's native tongue.
"""

from __future__ import annotations
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple


class MultilingualEngine:
    """Detects input language, normalizes intent, and localizes responses."""

    def __init__(self):
        # Unicode script block detection
        self.script_ranges = {
            "HINDI": (0x0900, 0x097F),       # Devanagari
            "TELUGU": (0x0C00, 0x0C7F),      # Telugu
            "KANNADA": (0x0C80, 0x0CFF),     # Kannada
            "MALAYALAM": (0x0D00, 0x0D7F),   # Malayalam
            "ARABIC": (0x0600, 0x06FF),      # Arabic
            "CHINESE": (0x4E00, 0x9FFF),     # CJK Unified Ideographs
            "JAPANESE": (0x3040, 0x30FF),    # Hiragana & Katakana
        }

        # Multilingual Action & Command Keyword Lexicons
        self.action_lexicon = {
            # Browser & App launching
            "OPEN_CHROME": {
                "HINDI": ["क्रोम खोलो", "chrome kholo", "chrome open karo", "chrome chaloo karo"],
                "TELUGU": ["క్రోమ్ తెరువు", "క్రోమ్ తెరవండి", "chrome teravandi", "chrome open cheyi"],
                "KANNADA": ["ಕ್ರೋಮ್ ತೆರೆಯಿರಿ", "chrome tereyiri", "chrome open madi"],
                "MALAYALAM": ["ക്രോം തുറക്കുക", "chrome thurakkuka", "chrome open cheyyuka"],
                "FRENCH": ["ouvre chrome", "lance chrome", "ouvrir chrome"],
                "ARABIC": ["افتح كروم", "تشغيل كروم", "فتح كروم"],
                "CHINESE": ["打开chrome", "启动chrome", "打开浏览器"],
                "JAPANESE": ["クロームを開いて", "chromeを開く", "ブラウザを起動"],
            },
            # System diagnostics
            "SYSTEM_DIAGNOSTICS": {
                "HINDI": ["सिस्टम चेक", "system check karo", "system ki jankari", "cpu ram dikhao"],
                "TELUGU": ["సిస్టమ్ తనిఖీ", "సిస్టమ్ స్టేటస్", "system chudu"],
                "KANNADA": ["ವ್ಯವಸ್ಥೆ ಪರಿಶೀಲಿಸಿ", "system nodi", "system status"],
                "MALAYALAM": ["സിസ്റ്റം പരിശോധിക്കുക", "system status nokkuka"],
                "FRENCH": ["statut système", "diagnostique système", "espace disque"],
                "ARABIC": ["فحص النظام", "حالة النظام", "استهلاك المعالج والذاكرة"],
                "CHINESE": ["检查系统", "系统状态", "系统诊断", "查看cpu"],
                "JAPANESE": ["システム診断", "システム状態", "cpuメモリ確認"],
            },
            # Temp cleaning
            "CLEAN_TEMP": {
                "HINDI": ["कचरा साफ करो", "temp file hatao", "temp saaf karo", "disk khali karo"],
                "TELUGU": ["టెంప్ ఫైల్స్ తొలగించు", "తాత్కాలిక ఫైల్లను క్లీన్ చేయండి", "డిస్క్ ఖాళీ చేయండి"],
                "KANNADA": ["ತಾತ್ಕಾಲಿಕ ಫೈಲ್‌ಗಳನ್ನು ಅಳಿಸಿ", "temp clean madi"],
                "MALAYALAM": ["ടെമ്പ് ഫയലുകൾ വൃത്തിയാക്കുക", "ഡിസ്ക് ക്ലീൻ ചെയ്യുക"],
                "FRENCH": ["nettoie les fichiers temporaires", "nettoyer cache", "vider temp"],
                "ARABIC": ["تنظيف الملفات المؤقتة", "حذف الكاش", "تفريغ الذاكرة المؤقتة"],
                "CHINESE": ["清理临时文件", "清理缓存", "释放磁盘空间"],
                "JAPANESE": ["一時ファイルを削除", "キャッシュをクリア", "ディスククリーンアップ"],
            },
            # Video Editing
            "VIDEO_EDIT": {
                "HINDI": ["वीडियो एडिट करो", "video edit karo", "video cut karo", "video trim karo"],
                "TELUGU": ["వీడియో ఎడిట్ చేయండి", "వీడియో కట్ చేయండి", "video edit cheyi"],
                "KANNADA": ["ವೀಡಿಯೊ ಎಡಿಟ್ ಮಾಡಿ", "ವೀಡಿಯೊ ಕತ್ತರಿಸಿ", "video edit madi"],
                "MALAYALAM": ["വീഡിയോ എഡിറ്റ് ചെയ്യുക", "വീഡിയോ മുറിക്കുക"],
                "FRENCH": ["éditer la vidéo", "couper la vidéo", "monter la vidéo"],
                "ARABIC": ["تعديل الفيديو", "قص الفيديو", "تحرير الفيديو"],
                "CHINESE": ["编辑视频", "剪辑视频", "裁剪视频"],
                "JAPANESE": ["動画を編集して", "動画カット", "動画トリミング"],
            },
            # Code Healer
            "HEAL_CODE": {
                "HINDI": ["कोड ठीक करो", "code fix karo", "error theek karo", "test theek karo"],
                "TELUGU": ["కోడ్ పరిష్కరించండి", "కోడ్ బాగుచేయి", "code fix cheyi"],
                "KANNADA": ["ಕೋಡ್ ಸರಿಪಡಿಸಿ", "code sari madi"],
                "MALAYALAM": ["കോഡ് പരിഹരിക്കുക", "പിശക് തിരുത്തുക"],
                "FRENCH": ["réparer le code", "corriger le bug", "réparer les tests"],
                "ARABIC": ["إصلاح الكود", "تصحيح الخطأ", "إصلاح الأخطاء البرمجية"],
                "CHINESE": ["修复代码", "解决错误", "修复测试"],
                "JAPANESE": ["コードを修復して", "バグ修正", "テスト修復"],
            },
            # Virtual Office
            "OFFICE_SWARM": {
                "HINDI": ["ऑफिस काम करो", "team ko bolo", "office swarm chalao"],
                "TELUGU": ["ఆఫీస్ పనులు చేయండి", "office swarm cheyi"],
                "KANNADA": ["ಕಚೇರಿ ಕೆಲಸ ಪ್ರಾರಂಭಿಸಿ", "office swarm madi"],
                "MALAYALAM": ["ഓഫീസ് ജോലികൾ ചെയ്യുക"],
                "FRENCH": ["lancer l'équipe bureau", "exécuter tâches bureau"],
                "ARABIC": ["تنفيذ مهام المكتب", "بدء عمل الفريق"],
                "CHINESE": ["执行团队任务", "办公室团队运行"],
                "JAPANESE": ["チームタスクを実行", "オフィス作業開始"],
            }
        }

        # Localized Greetings
        self.localized_greetings = {
            "HINDI": (
                "🙏 \033[1;36mनमस्ते! मैं CIEAV हूँ — आपका सम्प्रभु कंप्यूटर-नियंत्रण एजेंट OS.\033[0m\n"
                "मैं आपके CPU पर 100% स्थानीय रूप से बिना किसी क्लाउड API के काम करता हूँ।\n"
                "मैं वीडियो एडिटिंग, ऐप्स लॉन्च, सिस्टम सफाई और कोड रिपेयरिंग सब कुछ ऑटोमेट कर सकता हूँ!\n"
                "\033[90mआज़माएँ: 'क्रोम खोलो', 'सिस्टम चेक करो', 'कचरा साफ करो', 'वीडियो एडिट करो'\033[0m"
            ),
            "TELUGU": (
                "🙏 \033[1;36mనమస్కారం! నేను CIEAV — మీ స్వయంప్రతిపత్తి కంప్యూటర్-కంట్రోల్ ఏజెంట్ OS.\033[0m\n"
                "నేను క్లౌడ్ APIలు లేకుండా 100% లోకల్‌గా మీ CPU పై పనిచేస్తాను.\n"
                "వీడియో ఎడిటింగ్, యాప్ లాంచర్, సిస్టమ్ క్లీనప్ మరియు కోడ్ ఫిక్సింగ్ స్వయంచాలకంగా చేయగలను!\n"
                "\033[90mప్రయత్నించండి: 'క్రోమ్ తెరువు', 'సిస్టమ్ తనిఖీ', 'టెంప్ ఫైల్స్ తొలగించు'\033[0m"
            ),
            "KANNADA": (
                "🙏 \033[1;36mನಮಸ್ಕಾರ! ನಾನು CIEAV — ನಿಮ್ಮ ಸ್ವಾಯತ್ತ ಕಂಪ್ಯೂಟರ್-ನಿಯಂತ್ರಣ ಏಜೆಂಟ್ OS.\033[0m\n"
                "ಯಾವುದೇ ಕ್ಲೌಡ್ API ಇಲ್ಲದೆ 100% ಸ್ಥಳೀಯವಾಗಿ ನಿಮ್ಮ CPU ನಲ್ಲಿ ಕಾರ್ಯನಿರ್ವಹಿಸುತ್ತೇನೆ.\n"
                "ವೀಡಿಯೊ ಎಡಿಟಿಂಗ್, ಆಪ್‌ಗಳನ್ನು ತೆರೆಯುವುದು ಮತ್ತು ಸಿಸ್ಟಮ್ ನಿರ್ವಹಣೆಯನ್ನು ನಾನು ಸಂಪೂರ್ಣವಾಗಿ ಮಾಡುತ್ತೇನೆ!\n"
                "\033[90mಪ್ರಯತ್ನಿಸಿ: 'ಕ್ರೋಮ್ ತೆರೆಯಿರಿ', 'ವ್ಯವಸ್ಥೆ ಪರಿಶೀಲಿಸಿ', 'ತಾತ್ಕಾಲಿಕ ಫೈಲ್‌ಗಳನ್ನು ಅಳಿಸಿ'\033[0m"
            ),
            "MALAYALAM": (
                "🙏 \033[1;36mനമസ്കാരം! ഞാൻ CIEAV — നിങ്ങളുടെ കമ്പ്യൂട്ടർ-നിയന്ത്രണ ഏജന്റ് OS.\033[0m\n"
                "ക്ലൗഡ് API-കൾ ഇല്ലാതെ 100% ലോക്കലായി നിങ്ങളുടെ CPU-ൽ പ്രവർത്തിക്കുന്നു.\n"
                "വീഡിയോ എഡിറ്റിംഗ്, ആപ്പുകൾ തുറക്കൽ, സിസ്റ്റം ക്ലീനിംഗ് എന്നിവ എനിക്ക് യാന്ത്രികമായി ചെയ്യാൻ കഴിയും!\n"
                "\033[90mശ്രമിക്കുക: 'ക്രോം തുറക്കുക', 'സിസ്റ്റം പരിശോധിക്കുക', 'ടെമ്പ് ഫയലുകൾ വൃത്തിയാക്കുക'\033[0m"
            ),
            "FRENCH": (
                "👋 \033[1;36mBonjour ! Je suis CIEAV — Votre OS d'agent autonome souverain.\033[0m\n"
                "Je fonctionne à 100% localement sur votre processeur, sans aucune API cloud.\n"
                "Je prends le contrôle total de vos outils vidéo, applications, système et code !\n"
                "\033[90mEssayez : 'ouvre chrome', 'statut système', 'nettoie les fichiers temporaires'\033[0m"
            ),
            "ARABIC": (
                "👋 \033[1;36mمرحباً! أنا CIEAV — نظام وكيل التحكم الذاتي السيادي بالكمبيوتر.\033[0m\n"
                "أعمل محلياً بنسبة 100% على معالجك دون الحاجة لأي واجهات سحابية.\n"
                "أتحكم بالأدوات بالكامل: تحرير الفيديو، فتح التطبيقات، صيانة النظام، وإصلاح الكود!\n"
                "\033[90mجرب: 'افتح كروم', 'فحص النظام', 'تنظيف الملفات المؤقتة', 'تعديل الفيديو'\033[0m"
            ),
            "CHINESE": (
                "👋 \033[1;36m您好！我是 CIEAV — 全球顶级主权计算机控制智能体操作系统。\033[0m\n"
                "100% 本地 CPU 运行，零云端 API 依赖。\n"
                "可全自动控制视频编辑工具、桌面应用、系统维护与自主代码修复！\n"
                "\033[90m试试输入：'打开chrome'、'检查系统'、'清理临时文件'、'编辑视频'、'修复代码'\033[0m"
            ),
            "JAPANESE": (
                "👋 \033[1;36mこんにちは！CIEAVです — 超知能ローカル自律コンピュータ制御OS。\033[0m\n"
                "クラウドAPIを一切使用せず、100%ローカルCPUで動作します。\n"
                "動画編集ツールの操作、アプリ起動、システム保守、コード自己修復を自動実行します！\n"
                "\033[90m試してみてください：「クロームを開いて」「システム診断」「一時ファイルを削除」「動画を編集して」\033[0m"
            ),
            "ENGLISH": "Hey! Great to see you. How can I help you today?"
        }

    def is_greeting(self, text: str) -> bool:
        """Determines if the text is a conversational greeting or polite inquiry."""
        cleaned = re.sub(r'[^\w\s]', ' ', text.lower()).strip()
        words = cleaned.split()
        if not words:
            return False

        GREETING_ROOTS = {
            'hi', 'hey', 'hello', 'howdy', 'yo', 'sup', 'hola', 'namaste',
            'bonjour', 'greetings', 'salut', 'pranam', 'vanakkam', 'good',
            'morning', 'evening', 'afternoon'
        }
        GREETING_ALLOWLIST = GREETING_ROOTS | {
            'cieav', 'cieva', 'ceiav', 'there', 'friend', 'bro', 'buddy', 'man', 'dude', 'mate', 'bot',
            'day', 'how', 'are', 'you', 'doing', 'today', 'r', 'u', 'whats', 'what', 'is', 'up',
            'going', 'who', 'can', 'do', 'help', 'all', 'everyone', 'nice', 'to', 'meet', 'it', 'me'
        }

        if cleaned in ('who are you', 'what are you', 'what can you do', 'how are you', 'how r u', 'how are you doing', 'help me', 'whats up', "what's up"):
            return True

        has_root = any(w in GREETING_ROOTS for w in words)
        if not has_root:
            return False

        return all(w in GREETING_ALLOWLIST for w in words)

    def detect_language(self, text: str) -> str:
        """Identify language from Unicode characters and keyword patterns."""
        for char in text:
            cp = ord(char)
            for lang, (start, end) in self.script_ranges.items():
                if start <= cp <= end:
                    return lang

        lower = text.lower()
        # Latin script heuristics
        if any(w in lower for w in ("bonjour", "ouvre", "nettoie", "système", "éditer", "salut")):
            return "FRENCH"
        if any(w in lower for w in ("kholo", "karo", "saaf", "dikhao", "theek")):
            return "HINDI"
        if any(w in lower for w in ("teravandi", "cheyi", "chudu")):
            return "TELUGU"
        if any(w in lower for w in ("tereyiri", "madi", "nodi")):
            return "KANNADA"
        if any(w in lower for w in ("thurakkuka", "nokkuka", "cheyyuka")):
            return "MALAYALAM"

        return "ENGLISH"

    def match_multilingual_intent(self, text: str) -> Tuple[Optional[str], str]:
        """
        Detects if input matches a multilingual intent.
        Returns (action_intent, detected_language).
        """
        lang = self.detect_language(text)
        lower = text.lower().strip()

        # Check greetings across all languages including English
        if self.is_greeting(text):
            return ("GREETING", lang)

        GREETING_WORDS = {
            "HINDI": ["नमस्ते", "namaste", "pranam", "kaise ho", "kya kar sakte ho"],
            "TELUGU": ["నమస్కారం", "namaskaram", "ela unnaru"],
            "KANNADA": ["ನಮಸ್ಕಾರ", "namaskara", "hegiddeera"],
            "MALAYALAM": ["നമസ്കാരം", "namaskaram", "sukhamano"],
            "FRENCH": ["bonjour", "salut", "qui es tu", "que peux tu faire"],
            "ARABIC": ["مرحبا", "سلام", "أهلا", "من أنت", "ماذا تستطيع أن تفعل"],
            "CHINESE": ["你好", "您好", "你是谁", "你能做什么"],
            "JAPANESE": ["こんにちは", "おはよう", "あなたは誰", "何ができますか"],
            "ENGLISH": ["hi", "hello", "hey", "howdy", "yo", "sup", "good morning", "good evening", "how are you"]
        }
        for g_lang, words in GREETING_WORDS.items():
            if any(w in lower for w in words) and len(lower.split()) <= 4:
                return ("GREETING", g_lang)

        # Check action lexicon
        for intent, lang_dict in self.action_lexicon.items():
            for l, phrases in lang_dict.items():
                for phrase in phrases:
                    if phrase.lower() in lower:
                        return (intent, l)

        return (None, lang)

    def get_greeting(self, language: str) -> str:
        """Return personalized localized greeting."""
        return self.localized_greetings.get(language, self.localized_greetings.get("ENGLISH", ""))


# Global singleton Multilingual Engine
multilingual_engine = MultilingualEngine()
