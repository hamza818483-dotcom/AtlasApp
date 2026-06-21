// ============================================================
// ক, খ, CQ — MHTML/HTML Parser Module
// সম্পূর্ণ আলাদা ফাইল — admin.html ও exam.html শুধু এই ফাইলকে
// <script src="kakhacq/kakhacq-parser.js"></script> দিয়ে include করে,
// বাকি কোনো ফাইলের কোড স্পর্শ করা হয়নি।
// FLUTTER_READY: Convert to Dart parsing service
// ============================================================

const KaKhaCQParser = (function () {

    // ---------- ধাপ ১: mhtml ফাইল থেকে raw HTML বের করা ----------
    // ব্রাউজারে .mhtml ফাইল হলো multipart/related MIME ডকুমেন্ট।
    // আমরা text/html অংশটুকু খুঁজে বের করি এবং quoted-printable হলে ডিকোড করি।
    function extractHtmlFromMhtml(rawText) {
        const boundaryMatch = rawText.match(/boundary="?([^"\r\n]+)"?/i);
        if (!boundaryMatch) {
            // boundary না পেলে ধরে নিচ্ছি এটা প্লেইন .html ফাইল
            return rawText;
        }
        const boundary = boundaryMatch[1];
        const parts = rawText.split('--' + boundary);

        for (const part of parts) {
            if (/Content-Type:\s*text\/html/i.test(part)) {
                const isQP = /Content-Transfer-Encoding:\s*quoted-printable/i.test(part);
                const isB64 = /Content-Transfer-Encoding:\s*base64/i.test(part);
                // হেডার শেষ হওয়ার পরের blank line থেকে actual body শুরু
                const bodyStart = part.search(/\r?\n\r?\n/);
                if (bodyStart === -1) continue;
                let body = part.slice(bodyStart).trim();

                if (isQP) {
                    body = decodeQuotedPrintable(body);
                } else if (isB64) {
                    body = decodeBase64Unicode(body.replace(/[\r\n]+/g, ''));
                }
                return body;
            }
        }
        return rawText; // fallback
    }

    function decodeQuotedPrintable(str) {
        // soft line breaks (=\n) সরিয়ে ফেলা
        str = str.replace(/=\r?\n/g, '');
        // =XX hex বাইটগুলো বাইনারিতে রূপান্তর করে UTF-8 হিসেবে ডিকোড
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '=' && /[0-9A-Fa-f]{2}/.test(str.substr(i + 1, 2))) {
                bytes.push(parseInt(str.substr(i + 1, 2), 16));
                i += 2;
            } else {
                bytes.push(str.charCodeAt(i));
            }
        }
        try {
            return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
        } catch (e) {
            return str;
        }
    }

    function decodeBase64Unicode(b64) {
        try {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
            return '';
        }
    }

    // ---------- ধাপ ২: HTML থেকে DOM বানানো (parsing sandbox) ----------
    function toDom(htmlString) {
        const parser = new DOMParser();
        return parser.parseFromString(htmlString, 'text/html');
    }

    // ---------- সহায়ক: কোনো node-এর ভেতরের টেক্সট + ইমেজ বের করা ----------
    // রিটার্ন করে { text, images: [url, ...] } — ছবিগুলো placeholder
    // {{IMG_0}}, {{IMG_1}} ইত্যাদি হিসেবে টেক্সটে বসানো হয়, পরে ImgBB
    // আপলোডের পরের লিংক দিয়ে রিপ্লেস করা হবে।
    function extractContent(node) {
        if (!node) return { text: '', images: [] };
        const images = [];
        const clone = node.cloneNode(true);

        clone.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            // UI আইকন (svg, explanation_icon) বাদ — শুধু প্রশ্ন/উত্তরের আসল ছবি
            if (!src || src.includes('.svg') || src.includes('icon')) {
                img.remove();
                return;
            }
            const placeholder = `{{IMG_${images.length}}}`;
            images.push(src);
            img.replaceWith(document.createTextNode(placeholder));
        });

        // আইকন বাটন (flag/bookmark) ও আনইউজড UI অংশ ফেলে দেওয়া
        clone.querySelectorAll('button, svg').forEach(el => el.remove());

        let text = clone.textContent.normalize('NFC').replace(/\s+/g, ' ').trim();
        // "এই পর্যন্ত X পয়েন্ট" জাতীয় প্রগ্রেস মার্কার যেকোনো জায়গা থেকে সরানো
        // (NFC normalize করা হয়েছে যাতে য়-এর প্রিকম্পোজড/ডিকম্পোজড উভয় ফর্মই মেলে)
        text = text.replace(/এই পর্যন্ত\s*[০-৯0-9]+\s*পয়েন্ট/g, '').replace(/\s+/g, ' ').trim();
        // KaTeX রেন্ডার ভেঙে গিয়ে মাঝে মাঝে raw কমান্ড (যেমন \alpha, \beta) প্লেইন
        // টেক্সটে চলে আসে পাশের চিহ্নটার সাথে ডুপ্লিকেট হয়ে — সেই raw কমান্ডটুকু সরানো
        text = text.replace(/\\(alpha|beta|gamma|delta|Delta|mu|pi|sigma|Sigma|theta|lambda|omega)\b\s*/gi, '').replace(/\s+/g, ' ').trim();
        return { text, images };
    }

    // সল্যুশন অ্যাকর্ডিয়নের answer অংশ বের করা — সবচেয়ে কাছের
    // "সল্যুশন" বাটনযুক্ত <section> এর ভেতরের answer <div> থেকে
    function findSolutionFor(containerEl) {
        if (!containerEl) return { text: '', images: [] };
        const section = containerEl.querySelector('section');
        if (!section) return { text: '', images: [] };
        const answerDiv = section.querySelector('button + div');
        return extractContent(answerDiv);
    }

    // ---------- ক ভান্ডার পার্সার ----------
    // প্রতিটা প্রশ্ন: নাম্বার + প্রশ্ন টেক্সট + সোর্স ট্যাগ + সল্যুশন
    function parseKaFormat(dom) {
        const questions = [];
        const blocks = dom.querySelectorAll('.LatexRenderer-module__qDybqa__card');

        // প্রতিটা প্রশ্নের wrapper কার্ড খুঁজি: যেগুলোর parent-এ সোর্স ট্যাগ (tag-cyan) আছে
        const cards = dom.querySelectorAll('div.border.rounded-xl, div[class*="rounded-xl"][class*="p-5"]');
        cards.forEach(card => {
            const tagEl = card.querySelector('.tag-cyan, [class*="tag-cyan"]');
            const qContentEl = card.querySelector('.LatexRenderer-module__qDybqa__card');
            if (!qContentEl) return;

            const qData = extractContent(qContentEl);
            // নাম্বারিং ("1. ", "2.") শুরু থেকে সরিয়ে ফেলা
            const cleanText = qData.text.replace(/^\d+\.\s*/, '');
            if (!cleanText) return;

            const ansData = findSolutionFor(card);
            const source = tagEl ? tagEl.textContent.trim() : '';

            questions.push({
                question: cleanText,
                question_images: qData.images,
                answer: ansData.text,
                answer_images: ansData.images,
                source: source
            });
        });
        return questions;
    }

    // ---------- খ ভান্ডার পার্সার ----------
    // গঠন ক-এর মতোই (extractContent-এ প্রগ্রেস মার্কার ইতিমধ্যে পরিষ্কার করা হয়)
    function parseKhaFormat(dom) {
        return parseKaFormat(dom);
    }

    // ---------- CQ পার্সার ----------
    // প্রতিটা CQ: উদ্দীপক (stem) + কলেজ/বোর্ড সোর্স + ৪টা সাব-প্রশ্ন (ক,খ,গ,ঘ)
    // প্রতিটা সাব-প্রশ্নের নিজস্ব সল্যুশন accordion
    function parseCQFormat(dom) {
        const cqItems = [];
        const cards = dom.querySelectorAll('div.border.rounded-xl, div[class*="rounded-xl"][class*="p-5"]');

        cards.forEach(card => {
            const stemEl = card.querySelector('.LatexRenderer-module__qDybqa__card');
            if (!stemEl) return;
            const stemData = extractContent(stemEl);
            const stemText = stemData.text.replace(/^\d+\.\s*/, '');
            if (!stemText) return;

            const tagEl = card.querySelector('.tag-cyan, [class*="tag-cyan"]');
            const source = tagEl ? tagEl.textContent.trim() : '';

            // সাব-প্রশ্নগুলো (ক., খ., গ., ঘ.)
            const subBlocks = card.querySelectorAll('.mt-4.space-y-2 > div, [class*="space-y-2"] > div');
            const subQuestions = [];

            subBlocks.forEach(sub => {
                const labelEl = sub.querySelector('.flex.items-start.gap-3 > span, [class*="items-start"] > span');
                const label = labelEl ? labelEl.textContent.trim() : '';
                if (!/^[কখগঘ]\.?$/.test(label)) return;

                const qContentEl = sub.querySelector('.LatexRenderer-module__qDybqa__card');
                const qData = extractContent(qContentEl);
                const ansData = findSolutionFor(sub);

                subQuestions.push({
                    label: label.replace('.', ''),
                    question: qData.text,
                    question_images: qData.images,
                    answer: ansData.text,
                    answer_images: ansData.images
                });
            });

            if (subQuestions.length > 0) {
                cqItems.push({
                    stem: stemText,
                    stem_images: stemData.images,
                    source: source,
                    sub_questions: subQuestions
                });
            }
        });
        return cqItems;
    }

    // ---------- মূল এন্ট্রি পয়েন্ট ----------
    // type: 'ka' | 'kha' | 'cq'
    async function parseFile(file, type) {
        const rawText = await file.text();
        const isHtmlOnly = file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm');
        const htmlString = isHtmlOnly ? rawText : extractHtmlFromMhtml(rawText);

        if (!htmlString || htmlString.length < 50) {
            throw new Error('ফাইল থেকে কনটেন্ট খুঁজে পাওয়া যায়নি। ফাইলটি সঠিক mhtml/html কিনা যাচাই করুন।');
        }

        const dom = toDom(htmlString);

        let result;
        if (type === 'ka') result = { type: 'ka', items: parseKaFormat(dom) };
        else if (type === 'kha') result = { type: 'kha', items: parseKhaFormat(dom) };
        else if (type === 'cq') result = { type: 'cq', items: parseCQFormat(dom) };
        else throw new Error('অজানা টাইপ: ' + type);

        if (result.items.length === 0) {
            throw new Error('কোনো প্রশ্ন খুঁজে পাওয়া যায়নি। ফাইলের ফরম্যাট প্রত্যাশিত গঠনের সাথে না মিললে এটা হতে পারে।');
        }
        return result;
    }

    return { parseFile, extractHtmlFromMhtml, toDom };
})();

// ব্রাউজার গ্লোবাল স্কোপে এক্সপোজ — অন্য কোনো ফাইলের ভ্যারিয়েবলের সাথে কনফ্লিক্ট করবে না
window.KaKhaCQParser = KaKhaCQParser;
