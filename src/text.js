const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "i",
  "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "what", "with"
]);

const SPANISH_TO_ENGLISH = new Map([
  ["cuando", "when"], ["fecha", "date"], ["limite", "deadline"], ["escuela", "school"],
  ["registrar", "register"], ["registro", "registration"], ["estudiante", "student"],
  ["familia", "family"], ["necesito", "need"], ["donde", "where"], ["pagar", "pay"]
]);

export function normalize(text) {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(token => SPANISH_TO_ENGLISH.get(token) ?? token)
    .filter(token => !STOPWORDS.has(token));
}

export function sentences(text) {
  return text.match(/[^.!?\n]+[.!?]?/g)?.map(value => value.trim()).filter(Boolean) ?? [];
}

export function extractDates(text) {
  const month = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const patterns = [
    new RegExp(`\\b${month}\\s+\\d{1,2}(?:,\\s*\\d{4})?\\b`, "gi"),
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi
  ];
  return [...new Set(patterns.flatMap(pattern => text.match(pattern) ?? []))];
}

export function extractActions(text) {
  const actionVerbs = /\b(register|submit|complete|bring|pay|sign|upload|attend|return|apply|contact|verify)\b/i;
  return sentences(text)
    .filter(sentence => actionVerbs.test(sentence))
    .map(sentence => ({text: sentence, dates: extractDates(sentence)}));
}
