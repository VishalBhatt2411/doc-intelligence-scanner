const express = require('express');
const config = require('../config');
const { getProvider } = require('../providers');
const { buildExtractionPrompt } = require('../utils/promptBuilder');
const { DOCUMENT_TYPES } = require('../schemas/documentSchemas');
const { docxToText } = require('../utils/docxToText');

const router = express.Router();

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const VISION_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_MIME_TYPES = new Set([...VISION_MIME_TYPES, DOCX_MIME_TYPE]);

function estimateBase64Bytes(base64) {
  // 4 base64 chars encode 3 bytes; padding chars ('=') don't add real bytes.
  const padding = (base64.match(/=+$/) || [''])[0].length;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// POST /v1/extract  - image/PDF documents (equivalent to
// DocumentScannerController.extractFromFile -> DocumentExtractionService.extractFromImageOrPdf)
router.post('/extract', async (req, res, next) => {
  try {
    const { base64Data, mimeType, documentType, provider } = req.body || {};

    if (!base64Data || typeof base64Data !== 'string') {
      return res.status(400).json({ error: 'base64Data (string, no data: prefix) is required.' });
    }
    if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return res.status(400).json({
        error: `mimeType must be one of: ${[...ALLOWED_MIME_TYPES].join(', ')}`
      });
    }
    if (documentType && !DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({ error: `documentType must be one of: ${DOCUMENT_TYPES.join(', ')}` });
    }

    const sizeBytes = estimateBase64Bytes(base64Data);
    if (sizeBytes > config.maxFileBytes) {
      return res.status(413).json({
        error: `File is ~${(sizeBytes / (1024 * 1024)).toFixed(1)}MB, over the ${(
          config.maxFileBytes /
          (1024 * 1024)
        ).toFixed(0)}MB limit.`
      });
    }

    const aiProvider = getProvider(provider);

    // .docx has no reliable vision-model support - pull the text out server-side
    // (via mammoth) and route it through the same text-prompt path as /extract-text.
    if (mimeType === DOCX_MIME_TYPE) {
      let documentText;
      try {
        documentText = await docxToText(Buffer.from(base64Data, 'base64'));
      } catch (e) {
        return res.status(400).json({ error: 'Could not read .docx file - it may be corrupt or password-protected.' });
      }
      const prompt = `${buildExtractionPrompt(documentType || 'Auto')}\n\nDOCUMENT:\n${documentText}`;
      const result = await aiProvider.extract({ prompt, base64Data: null, mimeType: null });
      return res.json(result);
    }

    const prompt = buildExtractionPrompt(documentType || 'Auto');
    const result = await aiProvider.extract({ prompt, base64Data, mimeType });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

// POST /v1/extract-text - pre-extracted plain text (equivalent to
// DocumentScannerController.extractFromText, used for .docx uploads that were
// converted to text client-side).
router.post('/extract-text', async (req, res, next) => {
  try {
    const { documentText, documentType, provider } = req.body || {};

    if (!documentText || typeof documentText !== 'string') {
      return res.status(400).json({ error: 'documentText (string) is required.' });
    }
    if (documentType && !DOCUMENT_TYPES.includes(documentType)) {
      return res.status(400).json({ error: `documentType must be one of: ${DOCUMENT_TYPES.join(', ')}` });
    }

    const aiProvider = getProvider(provider);
    const prompt = `${buildExtractionPrompt(documentType || 'Auto')}\n\nDOCUMENT:\n${documentText}`;
    const result = await aiProvider.extract({ prompt, base64Data: null, mimeType: null });

    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
