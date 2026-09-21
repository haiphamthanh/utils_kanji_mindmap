// data.js — load kanji.json + relations.json, build lookup indexes.

let cache = null;

export async function loadData() {
  if (cache) return cache;

  const [kanji, relations] = await Promise.all([
    fetch("/data/kanji.json").then((r) => r.json()),
    fetch("/data/relations.json").then((r) => r.json()),
  ]);

  const outAdj = new Map(); // literal -> edges where from === literal
  const inAdj = new Map(); // literal -> edges where to === literal

  for (const edge of relations.edges) {
    if (!outAdj.has(edge.from)) outAdj.set(edge.from, []);
    outAdj.get(edge.from).push(edge);

    if (!inAdj.has(edge.to)) inAdj.set(edge.to, []);
    inAdj.get(edge.to).push(edge);
  }

  cache = {
    kanji,
    relations,
    outAdj,
    inAdj,
    list: Object.values(kanji),
  };
  return cache;
}

// ---------------------------------------------------------------
// Search: literal / kana / romaji / Vietnamese / English meaning
// ---------------------------------------------------------------

export function searchKanji(query, data, limit = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored = [];
  for (const entry of data.list) {
    const score = scoreEntry(entry, q);
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.entry.frequency || 99999) - (b.entry.frequency || 99999)
  );

  return scored.slice(0, limit).map((s) => s.entry);
}

function scoreEntry(entry, q) {
  let score = 0;
  const literal = entry.literal;

  if (literal === q) score = Math.max(score, 120);
  else if (literal.includes(q)) score = Math.max(score, 80);

  const on = (entry.readings && entry.readings.on) || [];
  const kun = (entry.readings && entry.readings.kun) || [];

  for (const reading of [...kun, ...on]) {
    const kana = reading.toLowerCase();
    if (kana === q) score = Math.max(score, 100);
    else if (kana.startsWith(q)) score = Math.max(score, 70);
    else if (kana.includes(q)) score = Math.max(score, 45);

    const romaji = kanaToRomaji(reading);
    if (romaji === q) score = Math.max(score, 95);
    else if (romaji.startsWith(q)) score = Math.max(score, 65);
    else if (romaji.includes(q)) score = Math.max(score, 40);
  }

  const vi = (entry.meanings && entry.meanings.vi) || [];
  const en = (entry.meanings && entry.meanings.en) || [];

  for (const meaning of vi) {
    const m = meaning.toLowerCase();
    if (m === q) score = Math.max(score, 75);
    else if (m.startsWith(q)) score = Math.max(score, 50);
    else if (m.includes(q)) score = Math.max(score, 35);
  }

  for (const meaning of en) {
    const m = meaning.toLowerCase();
    if (m === q) score = Math.max(score, 60);
    else if (m.startsWith(q)) score = Math.max(score, 30);
    else if (m.includes(q)) score = Math.max(score, 20);
  }

  return score;
}

// ---------------------------------------------------------------
// Minimal kana -> romaji (for romaji search)
// ---------------------------------------------------------------

const KANA = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゃ: "ya", ゅ: "yu", ょ: "yo", っ: "",
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
};

export function kanaToRomaji(input) {
  let s = "";
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    // katakana -> hiragana
    if (code >= 0x30a1 && code <= 0x30f6) {
      s += String.fromCharCode(code - 0x60);
    } else {
      s += ch;
    }
  }

  let out = "";
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (KANA[two] !== undefined) {
      out += KANA[two];
      i++;
      continue;
    }
    const one = s[i];
    if (KANA[one] !== undefined) out += KANA[one];
    else out += one;
  }
  return out;
}
