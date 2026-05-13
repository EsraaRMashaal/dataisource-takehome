/*
 * api/index.js — single entry point for all API functions
 *
 * Imports every function from the topic files and attaches them to
 * window so non-module scripts (home.js, news.js, tables.js, upload.js)
 * can call them as plain globals.
 *
 * Load order guarantee: this module is deferred by the browser and
 * executes before DOMContentLoaded, so all globals are set by the time
 * any DOMContentLoaded handler calls an API function.
 */

import { apiHealth }                                         from './health.js';
import {
  apiListDocuments, apiUpload, apiGetDocument,
  apiGetKeywords, apiGetEntities, apiDeleteDocument,
}                                                            from './documents.js';
import {
  apiNewsPoll, apiNewsAlerts, apiNewsDeleteAlerts, apiNewsGetAlert,
}                                                            from './news.js';
import {
  apiListTables, apiGetTableRows, apiClearTable, apiDeleteTableRow,
}                                                            from './tables.js';

Object.assign(window, {
  // Health
  apiHealth,
  // Documents
  apiListDocuments, apiUpload, apiGetDocument,
  apiGetKeywords, apiGetEntities, apiDeleteDocument,
  // News
  apiNewsPoll, apiNewsAlerts, apiNewsDeleteAlerts, apiNewsGetAlert,
  // Tables
  apiListTables, apiGetTableRows, apiClearTable, apiDeleteTableRow,
});
