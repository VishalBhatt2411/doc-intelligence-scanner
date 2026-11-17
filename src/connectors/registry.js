const salesforceConnector = require('./salesforceConnector');
const hubspotConnector = require('./hubspotConnector');

// The dynamic connector registry: adding support for another CRM means
// adding one entry here (metadata: auth scheme, credential fields, allowed
// host(s)) plus a small connector module exporting listObjects/describeFields
// /createRecord (see hubspotConnector.js as the template) - no new routes and
// no new hardcoded UI markup are needed, because routes/connectors.js and
// public/app.js both drive themselves off this list.
//
// `hostField` names which credential holds a caller-supplied base URL (e.g.
// a Salesforce org's instanceUrl, which differs per customer) that must be
// checked against `hostAllowlist` before any request is made, so a connector
// can't be turned into an open SSRF proxy. Connectors that always call one
// fixed, hardcoded API host (HubSpot, most SaaS CRMs) set `hostField: null`.
const registry = [
  {
    id: 'salesforce',
    label: 'Salesforce',
    authType: 'bearer',
    credentialFields: [
      { name: 'instanceUrl', label: 'Instance URL', placeholder: 'https://yourorg.my.salesforce.com' },
      { name: 'token', label: 'Access Token', secret: true, placeholder: 'paste a session/OAuth access token' }
    ],
    hostField: 'instanceUrl',
    hostAllowlist: /\.(salesforce\.com|force\.com)$/i,
    module: salesforceConnector
  },
  {
    id: 'hubspot',
    label: 'HubSpot',
    authType: 'bearer',
    credentialFields: [{ name: 'token', label: 'Private App Access Token', secret: true, placeholder: 'pat-...' }],
    hostField: null,
    hostAllowlist: /^api\.hubapi\.com$/i,
    module: hubspotConnector
  }
];

function list() {
  return registry.map(({ id, label, authType, credentialFields }) => ({ id, label, authType, credentialFields }));
}

function get(id) {
  return registry.find((c) => c.id === id);
}

module.exports = { list, get };
