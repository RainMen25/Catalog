"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tts = exports.translate = void 0;
const common = __importStar(require("../util/common"));
const ws = __importStar(require("ws"));
const crypto = __importStar(require("crypto"));
const microsoftApiDict = __importStar(require("./microsoft-api-dict"));
const ttsToken = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const ttsApi = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${ttsToken}&ConnectionId=`;
const translationAuth = "https://edge.microsoft.com/translate/auth";
// Official Document: 
// https://learn.microsoft.com/en-us/azure/ai-services/translator/reference/rest-api-guide
const translationApi = "https://api.cognitive.microsofttranslator.com";
const translationApiVersion = "3.0";
let token = "";
const getAuth = async () => {
    await fetch(translationAuth).then(i => i.text()).then(i => token = i);
};
const getPostOptions = (body) => {
    return {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${token}`,
        },
        body: JSON.stringify(body),
    };
};
const getTranslation = async (item) => {
    let result = {};
    await fetch(`${translationApi}/translate?api-version=${translationApiVersion}${getToLanguage(item)}${getFromLanguage(item)}`, getPostOptions([
        {
            Text: item.q,
        }
    ]))
        .then(i => i.json())
        .then(i => {
        result = i;
    });
    return result;
};
const getDictionary = async (item) => {
    let result = {};
    await fetch(`${translationApi}/dictionary/lookup?api-version=${translationApiVersion}${getToLanguage(item)}${getFromLanguage(item)}`, getPostOptions([
        {
            Text: item.q,
        }
    ]))
        .then(i => i.json())
        .then(i => {
        result = i;
    });
    return result;
};
const getExample = async (item, body) => {
    let result = {};
    await fetch(`${translationApi}/dictionary/examples?api-version=${translationApiVersion}${getToLanguage(item)}${getFromLanguage(item)}`, getPostOptions(body))
        .then(i => i.json())
        .then(i => {
        result = i;
    });
    return result;
};
const getToLanguage = (item) => {
    return `&to=${microsoftApiDict.translationMap.get(item.tl)}`;
};
const getFromLanguage = (item) => {
    if (item.sl === "auto")
        return "";
    return `&from=${microsoftApiDict.translationMap.get(item.sl)}`;
};
const translate = (item) => {
    return new Promise(async (resolve, reject) => {
        let result = {
            item,
            defaultResult: "",
            alternative: [],
            sourceLanguage: "",
            dictionary: [],
            definition: [],
            example: [],
        };
        await getAuth();
        let translation = await getTranslation(item);
        if (translation[0].detectedLanguage) {
            result.item.sl = microsoftApiDict.parseTranslation(translation[0].detectedLanguage.language);
            item.sl = result.item.sl;
        }
        result.item.results = translation[0].translations.map(i => i.text);
        result.defaultResult = translation[0].translations[0].text;
        result.sourceLanguage = result.item.sl;
        result.alternative.push(result.item.results);
        let dictionary = await getDictionary(item);
        if (dictionary.length && dictionary.length > 0) {
            dictionary[0].translations.forEach(d => {
                let posName = microsoftApiDict.posTagMap.get(d.posTag);
                let posArr = result.dictionary.filter(i => i.pos === posName);
                if (posArr.length > 0) {
                    posArr[0].entry?.push({
                        word: d.displayTarget,
                        reserve: d.backTranslations.map(i => i.displayText)
                    });
                }
                else {
                    result.dictionary.push({
                        pos: posName,
                        entry: [{
                                word: d.displayTarget,
                                reserve: d.backTranslations.map(i => i.displayText)
                            }]
                    });
                }
            });
            let example = await getExample(item, dictionary[0].translations.map(i => {
                return {
                    Text: dictionary[0].normalizedSource,
                    Translation: i.normalizedTarget,
                };
            }));
            if (example.length) {
                example.forEach(e => {
                    e.examples.forEach(i => {
                        result.example.push({
                            source: `${i.sourcePrefix}<b>${i.sourceTerm}</b>${i.sourceSuffix}`,
                            trans: `${i.targetPrefix}<b>${i.targetTerm}</b>${i.targetSuffix}`,
                        });
                    });
                });
            }
        }
        resolve(result);
    });
};
exports.translate = translate;
const tts = (item) => {
    return new Promise((resolve, reject) => {
        const websocket = new ws.WebSocket(`${ttsApi}${crypto.randomUUID()}`);
        let buffer = Buffer.from([]);
        websocket.on("open", () => {
            websocket.send(`
Content-Type: application/json; charset=utf-8\r
X-Timestamp: ${new Date().toUTCString()}\r
Path: speech.config\r
\r
{
    "context": {
        "synthesis": {
            "audio": {
                "metadataoptions": {
                    "sentenceBoundaryEnabled": true,
                    "wordBoundaryEnabled": false
                },
                "outputFormat": "audio-24khz-48kbitrate-mono-mp3"
            }
        }
    }
}
            `);
            websocket.send(`
X-RequestId: ${crypto.randomUUID()}\r
Content-Type: application/ssml+xml\r
X-Timestamp: ${new Date().toUTCString()}\r
Path: ssml\r
\r
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
    <voice name="${microsoftApiDict.voiceMap.get(item.tl)}">
        <prosody pitch="+0Hz" rate="+0%" volume="+0%">
${common.escapeHtml(item.q)}
        </prosody>
    </voice>
</speak>
            `);
        });
        websocket.on("message", (data, isBinary) => {
            if (isBinary) {
                let arr = data;
                buffer = Buffer.concat([buffer, arr.subarray(arr[1] + 2, arr.length)]);
            }
            else {
                let message = new String(data);
                if (message.indexOf("Path:turn.end") >= 0) {
                    resolve(buffer);
                    websocket.close();
                }
            }
        });
    });
};
exports.tts = tts;
//# sourceMappingURL=microsoft-api.js.map