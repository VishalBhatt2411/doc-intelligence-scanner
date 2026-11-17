const mammoth = require('mammoth');

// Unlike the original Apex service - which had no native DOCX/zip parser and
// pushed .docx text extraction into the browser via mammoth.js - this runs
// server-side with the Node build of the same library, so any caller (browser
// UI or a headless API client) can just send raw .docx bytes.
async function docxToText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

module.exports = { docxToText };
