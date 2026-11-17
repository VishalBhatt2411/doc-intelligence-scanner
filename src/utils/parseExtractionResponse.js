const { stripCodeFences } = require('./stripCodeFences');

// Turns the model's raw text reply (expected to be the JSON contract described
// in promptBuilder.js) into the flat result shape every provider returns,
// mirroring DocumentExtractionResult.cls so downstream consumers (Salesforce
// or anything else) see one stable schema regardless of which AI vendor answered.
function parseExtractionResponse(modelText, fallbackDocumentType) {
  const cleaned = stripCodeFences(modelText);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return {
      documentType: fallbackDocumentType || null,
      rawText: '',
      fields: [],
      errorMessage: 'Model did not return valid JSON.'
    };
  }

  const fields = Array.isArray(parsed.fields)
    ? parsed.fields
        .filter((f) => f && typeof f === 'object')
        .map((f) => ({
          fieldName: f.fieldName != null ? String(f.fieldName) : '',
          fieldValue: f.fieldValue != null ? String(f.fieldValue) : '',
          confidence: f.confidence != null && !Number.isNaN(Number(f.confidence)) ? Number(f.confidence) : null
        }))
    : [];

  return {
    documentType: parsed.documentType || fallbackDocumentType || null,
    rawText: typeof parsed.rawText === 'string' ? parsed.rawText : '',
    fields,
    errorMessage: null
  };
}

module.exports = { parseExtractionResponse };
