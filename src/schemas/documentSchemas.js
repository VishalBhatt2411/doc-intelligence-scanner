// Field hints per document type. These guide the model - they are not a rigid
// schema, and the model only returns fields it actually finds.
// Ported from IntellegenceScanner/force-app/main/default/classes/DocumentExtractionService.cls
// (fixed a garbled sentence in the original "Auto" hint - see README "Issues Found").
const SCHEMA_BY_TYPE = {
  Invoice:
    'invoiceNumber, invoiceDate, dueDate, poNumber, vendorName, vendorAddress, ' +
    'billToName, billToAddress, currency, subtotal, taxAmount, totalAmount, and one field ' +
    'per line item flattened as lineItem1_description, lineItem1_quantity, lineItem1_unitPrice, ' +
    'lineItem1_amount, lineItem2_description, etc.',
  Passport:
    'passportNumber, surname, givenNames, nationality, dateOfBirth, sex, placeOfBirth, ' +
    'dateOfIssue, dateOfExpiry, issuingCountry, issuingAuthority',
  Medical_Report:
    'patientName, patientId, dateOfBirth, reportDate, physicianName, facilityName, ' +
    'diagnosis, findings, medications, labResults, recommendations',
  Contract:
    'contractTitle, partyA, partyB, effectiveDate, expirationDate, contractValue, currency, ' +
    'paymentTerms, governingLaw, keyObligations, signatories',
  Resume:
    'candidateName, email, phone, location, summary, yearsOfExperience, ' +
    'currentTitle, currentEmployer, skills, education, certifications',
  Scanned_Document:
    'documentTitle, documentDate, sender, recipient, subject, summary',
  Auto:
    'your best guess at documentType (Invoice, Passport, Medical_Report, Contract, Resume, ' +
    'Scanned_Document, or Other), plus whatever key identifying fields make sense for that kind ' +
    'of document. For documents like resumes, extract only the main summary fields (see the ' +
    'Resume hint) rather than every line item.'
};

const DOCUMENT_TYPES = Object.keys(SCHEMA_BY_TYPE);

function schemaFor(documentType) {
  return SCHEMA_BY_TYPE[documentType] || SCHEMA_BY_TYPE.Auto;
}

module.exports = { SCHEMA_BY_TYPE, DOCUMENT_TYPES, schemaFor };
