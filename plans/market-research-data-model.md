# Typebot per ricerche di mercato strutturate — analisi e piano

Documento di progetto per le modifiche "research data model": codici/etichette, risposte multiple strutturate,
stato intervista, timestamp, CSV sicuro, probing ripetuti, colonne stabili, versioning, metadati per SPSS.

---

## 1. Analisi dell'architettura attuale

Flusso ricostruito dal codice:

```
builder (apps/builder)                      → Typebot.groups / Typebot.variables (JSON su tabella Typebot)
  └ publish: handlePublishTypebot.ts        → copia in PublicTypebot (UNA riga per bot, sovrascritta ad ogni publish)
viewer / bot-engine (packages/bot-engine)
  └ startSession.ts                         → carica PublicTypebot (findPublicTypebot.ts), crea resultId, SessionState v3
  └ continueBotFlow.ts                      → validateAndParseInputMessage.ts → parse*ChoiceReply → content: string
      └ saveAnswerInDb → queries/saveAnswer.ts → AnswerV2 {blockId, content: string, createdAt}
      └ saveInputVarIfAny                    → variabile = stringa (multiple choice = "A, C")
  └ saveStateToDatabase.ts → queries/upsertResult.ts → Result {createdAt, isCompleted, hasStarted, variables JSON}
builder results
  └ api/handleGetResults.ts                 → Result + answers (content) → resultWithAnswersSchema
  └ components/table/ExportAllResultsDialog → export client (<10k) con parseResultHeader + convertResultsToTableData
  └ api/handleStartExportJob.ts → workflows → packages/results/src/streamAllResultsToCsvV2.ts (≥10k, S3)
```

Problemi strutturali riscontrati (con riferimento al codice):

| # | Problema | Dove nasce |
|---|----------|-----------|
| 1 | Il dato salvato è solo `content: string`; se l'opzione ha un `value` si salva il value, altrimenti la label: nessuna mappa codice↔etichetta nel dato | `parseSingleChoiceReply.ts`, `AnswerV2.content` |
| 1b | Le variabili ammettono solo `string` o `string[]`, nessun tipo dichiarato | `packages/variables/src/schemas.ts` |
| 2 | Multiple choice concatenata con `", "` | `parseMultipleChoiceReply.ts` (`.join(", ")`) |
| 3 | L'export filtra solo `hasStarted: true`, non espone `isCompleted` | `streamAllResultsToCsvV2.ts`, `convertResultsToTableData.ts` |
| 4 | "Submitted at" = `Result.createdAt` (apertura del bot), formattato con `toLocaleString("default")`; nessun END_TS | `convertResultsToTableData.ts` |
| 5 | `sanitizeCsvCell` antepone `'` a `-5`, `+39…` | `sanitizeCsvCell.ts` (il DB **non** è alterato: è l'export a snaturare i numeri) |
| 6 | Più esecuzioni dello stesso blocco: nell'export vince una sola risposta; in sessione `setNewAnswerInState` sostituisce per `key` | `convertResultsToTableData.ts`, `continueBotFlow.ts` |
| 7 | Nome colonna = nome variabile **oppure titolo del gruppo**, con suffissi " (2)" dipendenti dall'ordine | `parseResultHeader.ts`, `continueBotFlow.parseGroupKey` |
| 8 | `PublicTypebot.typebotId @unique`: un solo snapshot pubblicato, sovrascritto; `PublicTypebot.version` è la versione dello **schema** ("6"), non del questionario; il Result non sa con quale versione è stato generato | `schema.prisma`, `handlePublishTypebot.ts` |

## 2. File coinvolti

Database: `packages/prisma/postgresql/schema.prisma`, `packages/prisma/mysql/schema.prisma`, nuova migration
`packages/prisma/postgresql/migrations/20260928120000_research_data_model/migration.sql`.

Schemi/tipi: `packages/variables/src/schemas.ts`, `packages/results/src/schemas/answers.ts`,
`packages/results/src/schemas/results.ts`, `packages/chat-session/src/schemas.ts`, `packages/chat-api/src/schemas.ts`,
`packages/typebot/src/schemas/publicTypebot.ts`.

Runtime: `packages/bot-engine/src/types.ts`, `validateAndParseInputMessage.ts`,
`blocks/inputs/buttons/parseSingleChoiceReply.ts`, `parseMultipleChoiceReply.ts`, `continueBotFlow.ts`,
`queries/saveAnswer.ts`, `queries/upsertResult.ts`, `saveStateToDatabase.ts`, `startSession.ts`,
`queries/findPublicTypebot.ts`.

Publish/versioning: `apps/builder/src/features/typebot/api/handlePublishTypebot.ts`, `router.ts`,
`apps/builder/src/features/publish/components/PublishButton.tsx`.

Export: `packages/results/src/research/*` (nuovo modulo), `sanitizeCsvCell.ts`,
`apps/builder/src/features/results/api/handleExportResearchDataset.ts` + `handleListPublishedVersions.ts` (nuovi),
`router.ts`, `components/table/ExportAllResultsDialog.tsx`, `workflows/exportResultsWorkflow.ts`.

UI variabili: `apps/builder/src/features/preview/components/VariablesDrawer.tsx`.

## 3. Modifiche al database

```prisma
model PublicTypebotVersion {           // NUOVO – snapshot immutabile ad ogni publish
  id            String   @id @default(cuid())
  typebotId     String
  versionNumber Int
  publishedAt   DateTime @default(now())
  publishedById String?
  schemaVersion String?                // ex PublicTypebot.version ("6")
  groups Json; events Json?; variables Json; edges Json; theme Json; settings Json
  @@unique([typebotId, versionNumber])
}
PublicTypebot  + currentVersionId String?, currentVersionNumber Int?
Result         + completedAt DateTime?, publishedVersionId String?, publishedVersionNumber Int?
AnswerV2       + executionIndex Int?, value Json?, valueLabel Json?
```

Tutte le colonne nuove sono nullable → nessun impatto sulle righe esistenti. `AnswerV2.content` resta
(testo mostrato in chat, transcript, webhook): **il dato di ricerca è `value`** (JSON tipizzato: numero, stringa,
booleano, array). Timestamp: colonne `DateTime` Prisma = `timestamp(3)` UTC; la conversione al fuso avviene solo in export.

## 4. Modifiche ai tipi TypeScript

- `Variable` (`baseVariableSchema`): campi opzionali `dataType` (`string | number | boolean | string[] | number[] | datetime`),
  `label` (etichetta SPSS), `missingValues` (codici di missing). I **valori runtime** restano quelli attuali
  (stringa/lista) per non rompere interpolazioni `{{var}}`, condizioni e script; il tipo dichiarato guida la
  coercizione in salvataggio (`AnswerV2.value`) e in export.
- `SuccessReply` (bot-engine): nuovo campo `structuredAnswer?: { value, label }`.
- `SessionState` v3: nuovo campo opzionale `publishedVersion?: { id, number }`.
- `answerSchema` (results): campi opzionali `createdAt`, `executionIndex`, `value`, `valueLabel`.
- `resultSchema`: `completedAt`, `publishedVersionId`, `publishedVersionNumber`.

## 5. Salvataggio delle risposte

1. `parseSingleChoiceReply` / `parseMultipleChoiceReply` restituiscono anche `structuredAnswer`
   (`value` = value dell'opzione o, se assente, la label; `label` = testo mostrato). Multiple → **array** nell'ordine delle opzioni.
2. `validateAndParseInputMessage` produce `structuredAnswer` anche per number, rating (numero), date (ISO), testo/email/phone/url (stringa).
3. `continueBotFlow` passa `structuredAnswer` a `saveAnswerInDb`; il valore viene coerciato al `dataType` della variabile collegata.
4. `saveAnswer` calcola `executionIndex` = n° risposte già presenti per (resultId, blockId) + 1 → nessuna risposta viene più persa.
5. Variabile collegata: se `dataType` è `string[]`/`number[]` la multiple choice viene salvata come **lista**; altrimenti comportamento legacy (stringa) per retrocompatibilità.
6. `upsertResult` scrive `publishedVersionId/Number` alla creazione; `saveStateToDatabase` imposta `completedAt` una sola volta (update condizionato a `completedAt IS NULL`).

## 6. Pubblicazione / versioning

`handlePublishTypebot`: dentro una transazione calcola `max(versionNumber)+1`, crea `PublicTypebotVersion`
(immutabile, mai aggiornata) e aggiorna `PublicTypebot` (copia "live" usata dal viewer, invariata) con
`currentVersionId/Number`. `startSession` legge la versione corrente e la mette nello stato di sessione, così
un'intervista iniziata sulla v12 resta v12 anche se durante l'intervista si pubblica la v13.
Nuovo endpoint `GET /v1/typebots/{typebotId}/published-versions`. Unpublish non cancella le versioni.

Validazione alla pubblicazione (warning non bloccanti, mostrati nel builder): nomi variabile duplicati,
blocchi input senza variabile (la colonna non sarebbe stabile), variabile scritta da più blocchi input.

## 7. Export

Nuovo modulo puro `packages/results/src/research/` (testabile senza DB):

- `buildDatasetDictionary` → dizionario domande dalle versioni (id blocco, variableId, **variableName** = nome colonna,
  label, tipo, opzioni value→label, missing, multipla sì/no). Il nome colonna non dipende da testi o titoli dei gruppi.
- `normalizeResultAnswers` → risposte strutturate, con fallback legacy.
- `computeInterviewStatus` → `NOT_STARTED | STARTED | ABANDONED | COMPLETE`.
- `buildResearchDataset` → colonne + righe con opzioni:
  valore (`value | label | both`), multiple (`compact` con separatore configurabile | `dichotomous` D2_1…D2_n),
  ripetizioni (`columns` PROBE_1_1… | `json` | `last`), filtro stato (`all | complete | incomplete`), filtro versione, fuso orario.
- Colonne di sistema: `RESULT_ID, STATUS, IS_STARTED, IS_COMPLETED, START_TS, END_TS, LAST_ACTIVITY_TS,
  DURATION_SECONDS, TYPEBOT_VERSION, TYPEBOT_VERSION_ID`.
- `serializeDatasetToCsv` → `excelSafe` (default: protegge solo stringhe non numeriche che iniziano con `= + - @ \t \r`) | `raw` (con warning).
- `buildCodebook` → metadati SPSS-ready (name, label, type, width, value labels, missing, measure, multiple response set).
  Il writer `.sav` non è incluso: il codebook contiene tutto ciò che serve (es. `pyreadstat`/`haven` o una libreria JS) senza toccare di nuovo il modello dati.

Builder: `POST /v1/typebots/{typebotId}/results/export-research` (CSV + codebook), dialog export con le opzioni
e la selezione della versione. Il vecchio export resta disponibile come formato "Legacy".

## 8. Retrocompatibilità

- Colonne nuove nullable, nessun dato riscritto.
- Risposte legacy (`value` null): `value` ricostruito in lettura da `content`; multiple legacy `"A, B, C"`
  ri-abbinate alle opzioni note (match greedy per label/valore più lungo, come fa oggi il runtime), split su `", "` solo come ultima risorsa.
- `executionIndex` null → assegnato in lettura in ordine di `createdAt`.
- Result senza `completedAt` ma `isCompleted` → END_TS = ultima risposta (flag `END_TS_ESTIMATED` nel codebook).
- Result senza versione → `TYPEBOT_VERSION` vuoto (= "pre-versioning"); la migration crea la v1 per ogni bot già pubblicato,
  così le interviste nuove sono subito versionate.
- Sessioni in corso (SessionState senza `publishedVersion`) → il Result resta senza versione.
- Variabili multiple senza `dataType` restano stringhe: nessun cambio di comportamento per condizioni/webhook esistenti.

## 9. Piano di migrazione

1. Backup DB. 2. `migrate deploy` (PostgreSQL) / `db push` (MySQL). La migration è additiva e crea la v1 per i bot pubblicati.
3. Deploy builder + viewer + workflows insieme (il viewer scrive i campi nuovi, il builder li legge).
4. Nessun backfill obbligatorio delle risposte: normalizzazione in lettura.
5. Per i progetti in field: dichiarare `dataType`/`label` delle variabili e ripubblicare → nasce la v2, le interviste precedenti restano v1.

## 10. Possibili breaking changes

- API pubblica `GET /results`: output con campi aggiuntivi (additivo, non breaking per client tolleranti).
- `publishTypebot`: `warnings` può contenere nuovi tipi → il builder aggiornato li gestisce; client esterni che assumono solo `trademarkInfringement` vanno aggiornati.
- Un `saveAnswer` fa una query in più (`count`) per calcolare `executionIndex`.
- Variabili con `dataType` array: la multiple choice diventa lista → condizioni "equal to 'A, B'" scritte a mano vanno riviste (solo se si sceglie il nuovo tipo).
- CSV "Excel-safe": i numeri (`-5`, `+393…`) non ricevono più l'apostrofo. `+393…` aperto in Excel viene letto come numero: per i telefoni usare XLSX/SAV o il formato Raw.

---

# Implementazione — registro modifiche

### Database
FILE: `packages/prisma/postgresql/schema.prisma`, `packages/prisma/mysql/schema.prisma`
MOTIVO: versioning, timestamp di fine, tracciamento esecuzioni, valori tipizzati.
MODIFICA: nuovo modello `PublicTypebotVersion`; `PublicTypebot.currentVersionId/currentVersionNumber`; `Result.completedAt/publishedVersionId/publishedVersionNumber` + indice `(typebotId, publishedVersionNumber)`; `AnswerV2.executionIndex/value/valueLabel` + indice `(resultId, blockId)`. Il file è stato riformattato con `prisma format` (allineamento colonne).

FILE: `packages/prisma/postgresql/migrations/20260928120000_research_data_model/migration.sql`
MOTIVO: migrazione additiva + versione 1 per i bot già pubblicati.
MODIFICA: `ALTER TABLE` con colonne nullable, `CREATE TABLE "PublicTypebotVersion"`, indici, FK, backfill v1 da `PublicTypebot`. Verificata applicando tutte le 85 migration su PostgreSQL (PGlite) con dati legacy.

### Tipi e schemi
FILE: `packages/variables/src/schemas.ts`
MOTIVO: tipi variabile espliciti.
MODIFICA: `variableDataTypes` (`string, number, boolean, string[], number[], datetime`), campi opzionali `dataType`, `label`, `missingValues` su ogni variabile.

FILE: `packages/results/src/schemas/answers.ts`, `packages/results/src/schemas/results.ts`
MOTIVO: esporre il dato strutturato.
MODIFICA: `answerResearchValueSchema`, `answerValueLabelSchema`, campi `executionIndex/value/valueLabel` sulle risposte, `researchAnswerSchema` (con `createdAt`); `completedAt`, `publishedVersionId`, `publishedVersionNumber` sui result.

FILE: `packages/chat-session/src/schemas.ts`, `packages/chat-api/src/schemas.ts`, `packages/typebot/src/schemas/publicTypebot.ts`
MOTIVO: la versione con cui parte l'intervista deve viaggiare nella sessione.
MODIFICA: `SessionState.publishedVersion`, `currentVersionId/Number` negli schemi di avvio e del typebot pubblicato.

### Salvataggio risposte (viewer / bot-engine)
FILE: `packages/bot-engine/src/types.ts`
MOTIVO: separare dato di ricerca e testo mostrato.
MODIFICA: tipo `StructuredAnswer { value, label }` in `SuccessReply`.

FILE: `packages/bot-engine/src/blocks/inputs/buttons/parseSingleChoiceReply.ts`, `parseMultipleChoiceReply.ts` (+ test)
MOTIVO: codice ≠ etichetta, multiple come array.
MODIFICA: restituiscono `structuredAnswer`; la multipla è un array di value e un array di label. `content` resta invariato (compatibilità chat/webhook).

FILE: `packages/bot-engine/src/helpers/buildAnswerResearchFields.ts` (nuovo, + test)
MOTIVO: calcolare `value`/`valueLabel` tipizzati.
MODIFICA: usa `structuredAnswer` o deriva il valore dal tipo di blocco (numero, rating), poi applica il `dataType` della variabile.

FILE: `packages/bot-engine/src/continueBotFlow.ts`
MOTIVO: far arrivare il dato strutturato fino al database.
MODIFICA: `structuredAnswer` passato a `saveAnswerInDb`/`saveInputVarIfAny`; variabili con `dataType` `string[]`/`number[]` salvate come lista.

FILE: `packages/bot-engine/src/queries/saveAnswer.ts` (+ test)
MOTIVO: nessuna risposta sovrascritta.
MODIFICA: `executionIndex` = risposte già presenti per (result, blocco) + 1; salva `value`/`valueLabel`.

FILE: `packages/bot-engine/src/queries/markResultAsCompleted.ts` (nuovo), `saveStateToDatabase.ts`, `walkFlowForward.ts`
MOTIVO: END_TS reale.
MODIFICA: `completedAt` impostato una sola volta (`WHERE completedAt IS NULL`).

FILE: `packages/bot-engine/src/queries/upsertResult.ts`, `startSession.ts`, `startBotFlow.ts`, `queries/findPublicTypebot.ts`
MOTIVO: ogni intervista memorizza la versione.
MODIFICA: la sessione live riceve `publishedVersion` da `PublicTypebot.currentVersion*`; il Result la salva alla creazione (solo per il bot principale, non per i bot collegati).

### Pubblicazione / versioning (builder)
FILE: `apps/builder/src/features/typebot/helpers/publishNewVersion.ts` (nuovo, + test)
MOTIVO: versioni immutabili.
MODIFICA: in transazione crea `PublicTypebotVersion` n+1 e aggiorna la copia live; retry su conflitto di numero versione.

FILE: `apps/builder/src/features/typebot/api/handlePublishTypebot.ts`, `router.ts`
MOTIVO: publish versionato e validazione della struttura.
MODIFICA: usa `publishNewVersion`, restituisce `publishedVersion`, aggiunge warning `researchStructure` (nomi duplicati, blocchi input senza variabile, variabile condivisa).

FILE: `apps/builder/src/features/typebot/api/handleListPublishedVersions.ts` (nuovo)
MOTIVO: elenco versioni.
MODIFICA: `GET /v1/typebots/{typebotId}/published-versions` con numero di interviste per versione.

FILE: `apps/builder/src/features/publish/components/PublishButton.tsx`
MOTIVO: mostrare numero versione e warning.
MODIFICA: toast con i warning di struttura; gestione del warning trademark invariata.

FILE: `apps/builder/src/features/preview/components/VariablesDrawer.tsx`
MOTIVO: dichiarare tipo, etichetta e missing delle variabili.
MODIFICA: nel popover di ogni variabile: Data type, Label, Missing values.

### Export
FILE: `packages/results/src/research/*` (nuovo modulo, puro e testato)
MOTIVO: dataset di ricerca coerente.
MODIFICA: `coerceResearchValue`, `buildDatasetDictionary`, `normalizeResultAnswers` (fallback legacy), `computeInterviewTiming` (STATUS/START_TS/END_TS/DURATION), `buildResearchDataset`, `serializeDatasetToCsv` (Excel-safe/Raw), `buildCodebook` (metadati SPSS), `validateResearchStructure`, `loadResearchExportData`, `exportResearchDataset`.

FILE: `packages/results/src/sanitizeCsvCell.ts`
MOTIVO: anche l'export legacy snaturava `-5` e `+39…`.
MODIFICA: i letterali numerici non ricevono più l'apostrofo.

FILE: `apps/builder/src/features/results/api/handleExportResearchDataset.ts` (nuovo), `router.ts`
MOTIVO: export diretto.
MODIFICA: `POST /v1/typebots/{typebotId}/results/export-research` → CSV + codebook JSON (fino a 20.000 interviste).

FILE: `packages/results/src/workflows/exportResultsWorkflow.ts`, `rpc.ts`, `apps/builder/src/features/results/api/handleStartExportJob.ts`, `components/table/ExportJobProgress.tsx`
MOTIVO: export grandi in background.
MODIFICA: opzione `researchOptionsJson`; il workflow carica CSV + codebook su S3; la UI mostra entrambi i link.

FILE: `apps/builder/src/features/results/components/table/ExportAllResultsDialog.tsx`
MOTIVO: interfaccia di export.
MODIFICA: formato Research/Legacy; filtri stato e versione; value/label/both; multiple compatte (separatore) o dicotomiche; ripetizioni in colonne/JSON/ultima; CSV Excel-safe/Raw con avviso; download del codebook.

### Altri file
`packages/results/package.json` e `tsconfig.lib.json` (dipendenza `@typebot.io/blocks-bubbles`), `bun.lock`, `apps/docs/openapi/builder.json` (rigenerato con `nx generate-openapi builder`).

## Verifiche eseguite

| Verifica | Esito |
|---|---|
| `nx run-many -t typecheck` (builder, viewer, workflows, bot-engine, results, chat-session, chat-api + 63 dipendenze) | ✅ |
| `nx typecheck` root | gli unici errori sono in `apps/landing-page`, identici prima e dopo le modifiche |
| `nx format-and-lint` (Biome, 2503 file) | ✅ |
| `bun test` results | 16 pass; 1 fail preesistente (`rpc.test.ts` richiede `DATABASE_URL`) |
| `bun test` bot-engine | 54 pass; 6 fail preesistenti (`parseEmailAttachments`, env) |
| `bun test` builder results/typebot/publish | 106 pass; 1 fail preesistente (`isReadTypebotForbidden` admin env) |
| Migration su PostgreSQL (PGlite): 85 migration + backfill | ✅ |
| Test end-to-end con Prisma reale su PGlite: publish v1 → risposte → completamento → publish v2 → export | ✅ |

Test aggiunti (richiesti): single choice label/value · multiple choice array · label con virgola · intervista completa/incompleta (+ ABANDONED, NOT_STARTED, filtri) · START_TS/END_TS/DURATION (UTC e Europe/Rome) · `-5` · `+39…` · blocco eseguito due volte (colonne, JSON, ultima) · rename label senza cambio colonna · due versioni dello stesso typebot (+ filtro) · lettura di un risultato legacy · codebook SPSS · nomi variabile duplicati · publish versionato.

Non eseguiti: la suite Vitest con container database (`bunx nx test`) e i test Playwright, perché qui Docker non è disponibile.

---

# Aggiornamento — FIELDBOT: export SPSS .sav e rebrand

### Export SPSS .sav
FILE: `packages/results/src/research/sav/writeSavFile.ts` (nuovo)
MOTIVO: estrazione SPSS nativa, senza servizi esterni.
MODIFICA: writer TypeScript del formato SPSS system file (non compresso, UTF-8): variabili numeriche/stringa/datetime, etichette variabile, value labels, missing discreti, livello di misura, nomi lunghi, stringhe molto lunghe (>255 byte, segmentate come SPSS/ReadStat), multiple response set dicotomici.

FILE: `packages/results/src/research/sav/convertDatasetToSav.ts` (nuovo, + test)
MOTIVO: dal dataset di ricerca + codebook al file .sav.
MODIFICA: tipi dedotti dai dati, decimali automatici, timestamp come DATETIME nell'orario del fuso scelto, MR set `$D2` dalle dicotomiche.

FILE: `packages/results/src/research/schemas.ts`, `exportResearchDataset.ts`, `workflows/exportResultsWorkflow.ts`, `apps/builder/.../handleExportResearchDataset.ts`, `router.ts`, `ExportAllResultsDialog.tsx`
MODIFICA: opzione `fileFormat: "csv" | "sav"`; l'endpoint restituisce `savBase64`; export in background carica il .sav su S3; nel dialog il formato predefinito è SPSS (.sav) con multiple dicotomiche.

Verifica: il file generato viene riletto da pyreadstat (ReadStat) con etichette, value labels, missing, misure, datetime, MR set e testi UTF-8 lunghi intatti.

### Rebrand FIELDBOT
Logo (bolla di chat con barre di risposta) in builder, viewer, badge e favicon; titoli pagina `| FIELDBOT`; testi dell'interfaccia in 9 lingue ("Typebot" → "FIELDBOT", "typebot" → "bot"); badge "Made with FIELDBOT" → fieldgood.it; email transazionali. Nomi interni del codice, API e licenza FSL invariati.

## Research question blocks (matrix, exclusive options, other-specify, tracked video)

- **Matrix** (`matrix input`, `packages/blocks/inputs/src/matrix`): rows and columns `{id, label, value}`; `answerMode` single|multiple; `requiredMode` all|none|custom (+ row `isRequired`); `minAnsweredRows`/`maxAnsweredRows`; row/column randomization done by the engine (display order only). Answer `value` = `{rowCode: columnCode | columnCode[]}`, `valueLabel` = same shape with labels, block variable = JSON of `value`, optional per-row variables. Export: `D10_<rowCode>` (value labels = columns, ordinal), multiple per row + dichotomous: `D10_<row>_<col>`.
- **Choice options**: `isExclusive`, `hasTextInput`, `textInputRequired`, `textInputPlaceholder`; block `minSelections`/`maxSelections` (an exclusive answer is always valid). Rules shared by client and engine (`choice/helpers`). Open texts are sent as a structured reply and stored in `AnswerV2.otherTexts` (`{"98": "Brand XYZ"}`), never in `content`/labels. Export: `D5_OTHER` (single), `D5_<code>_TEXT` (multiple).
- **Tracked video** (video bubble `watchTracking`, native files only): the flow waits on the bubble (not on WhatsApp); the client sends `{isStarted, isCompleted, watchedSeconds, watchedPercentage, durationSeconds, pauseCount, events[]}` computed from HTML5 `played` ranges; forward seeking can be blocked; saved as the block answer. Export: `<NAME>_STARTED`, `_COMPLETED`, `_WATCHED_SECONDS`, `_WATCHED_PCT`, `_PAUSES`.
- Structured replies travel in `textMessageSchema.structuredReply` (`choice` | `matrix` | `video`); plain text replies keep working (matrix accepts JSON or `row=column` pairs).
- Migration `20260930090000_answer_other_texts` (nullable JSONB column, additive).
