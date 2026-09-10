/*! conventional-commits-parser — MIT
### MIT License

Copyright © [conventional-changelog team](https://github.com/conventional-changelog)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

// src/index.js
import { readFileSync } from "node:fs";

// node_modules/conventional-commits-parser/dist/regex.js
var nomatchRegex = /(?!.*)/;
function escape(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function joinOr(parts) {
  return parts.map((val) => typeof val === "string" ? escape(val.trim()) : val.source).filter(Boolean).join("|");
}
function getNotesRegex(noteKeywords, notesPattern) {
  if (!noteKeywords) {
    return nomatchRegex;
  }
  const noteKeywordsSelection = joinOr(noteKeywords);
  if (!notesPattern) {
    return new RegExp(`^(?:\\*\\s+)?(${noteKeywordsSelection}):\\s*(.*)`, "i");
  }
  return notesPattern(noteKeywordsSelection);
}
function getReferencePartsRegex(issuePrefixes, issuePrefixesCaseSensitive) {
  if (!issuePrefixes) {
    return nomatchRegex;
  }
  const flags = issuePrefixesCaseSensitive ? "g" : "gi";
  return new RegExp(`(?:.*?)??\\s*([\\w-\\.\\/]*?)??(${joinOr(issuePrefixes)})([\\w-]+)(?=\\s|$|[,;.)\\]])`, flags);
}
function getReferencesRegex(referenceActions) {
  if (!referenceActions) {
    return /()(.+)/gi;
  }
  const joinedKeywords = joinOr(referenceActions);
  return new RegExp(`(${joinedKeywords})(?:\\s+(.*?))(?=(?:${joinedKeywords})|$)`, "gi");
}
function getFooterTokenRegex(issuePrefixes) {
  const issuePrefixSeparator = issuePrefixes ? `|\\s+(?:${joinOr(issuePrefixes)})` : "";
  return new RegExp(`^(?:BREAKING CHANGE|[\\w-]+)(?::\\s+${issuePrefixSeparator}).+`, "i");
}
function getParserRegexes(options2 = {}) {
  const notes = getNotesRegex(options2.noteKeywords, options2.notesPattern);
  const referenceParts = getReferencePartsRegex(options2.issuePrefixes, options2.issuePrefixesCaseSensitive);
  const references = getReferencesRegex(options2.referenceActions);
  const footerToken = getFooterTokenRegex(options2.issuePrefixes);
  return {
    notes,
    referenceParts,
    references,
    footerToken,
    mentions: /@([\w-]+)/g,
    url: /\b(?:https?):\/\/(?:www\.)?([-a-zA-Z0-9@:%_+.~#?&//=])+\b/
  };
}

// node_modules/conventional-commits-parser/dist/utils.js
var SCISSOR = "------------------------ >8 ------------------------";
function trimNewLines(input) {
  const matches = input.match(/[^\r\n]/);
  if (typeof matches?.index !== "number") {
    return "";
  }
  const firstIndex = matches.index;
  let lastIndex = input.length - 1;
  while (input[lastIndex] === "\r" || input[lastIndex] === "\n") {
    lastIndex--;
  }
  return input.substring(firstIndex, lastIndex + 1);
}
function appendLine(src, line) {
  return src ? `${src}
${line || ""}` : line || "";
}
function getCommentFilter(char) {
  return char ? (line) => !line.startsWith(char) : () => true;
}
function truncateToScissor(lines, commentChar) {
  const scissorIndex = lines.indexOf(`${commentChar} ${SCISSOR}`);
  if (scissorIndex === -1) {
    return lines;
  }
  return lines.slice(0, scissorIndex);
}
function gpgFilter(line) {
  return !line.match(/^\s*gpg:/);
}
function assignMatchedCorrespondence(target, matches, correspondence) {
  const { groups } = matches;
  for (let i = 0, len = correspondence.length, key; i < len; i++) {
    key = correspondence[i];
    target[key] = (groups ? groups[key] : matches[i + 1]) || null;
  }
  return target;
}

// node_modules/conventional-commits-parser/dist/options.js
var defaultOptions = {
  noteKeywords: ["BREAKING CHANGE", "BREAKING-CHANGE"],
  issuePrefixes: ["#"],
  referenceActions: [
    "close",
    "closes",
    "closed",
    "fix",
    "fixes",
    "fixed",
    "resolve",
    "resolves",
    "resolved"
  ],
  headerPattern: /^(\w*)(?:\(([\w$@.\-*/ ]*)\))?: (.*)$/,
  headerCorrespondence: [
    "type",
    "scope",
    "subject"
  ],
  revertPattern: /^Revert\s"([\s\S]*)"\s*This reverts commit (\w*)\.?/,
  revertCorrespondence: ["header", "hash"],
  // The field name must contain at least one word character so that
  // YAML document markers like `---` are not treated as field markers.
  fieldPattern: /^-(?=.*\w)(.*?)-$/
};

// node_modules/conventional-commits-parser/dist/CommitParser.js
function createCommitObject(initialData = {}) {
  return {
    merge: null,
    revert: null,
    header: null,
    body: null,
    footer: null,
    notes: [],
    mentions: [],
    references: [],
    ...initialData
  };
}
var CommitParser = class {
  options;
  regexes;
  lines = [];
  lineIndex = 0;
  commit = createCommitObject();
  constructor(options2 = {}) {
    this.options = {
      ...defaultOptions,
      ...options2
    };
    this.regexes = getParserRegexes(this.options);
  }
  currentLine() {
    return this.lines[this.lineIndex];
  }
  nextLine() {
    return this.lines[this.lineIndex++];
  }
  isLineAvailable() {
    return this.lineIndex < this.lines.length;
  }
  parseReference(input, action) {
    const { regexes } = this;
    if (regexes.url.test(input)) {
      return null;
    }
    const matches = regexes.referenceParts.exec(input);
    if (!matches) {
      return null;
    }
    let [raw, repository = null, prefix, issue] = matches;
    let owner = null;
    if (repository) {
      const slashIndex = repository.indexOf("/");
      if (slashIndex !== -1) {
        owner = repository.slice(0, slashIndex);
        repository = repository.slice(slashIndex + 1);
      }
    }
    return {
      raw,
      action,
      owner,
      repository,
      prefix,
      issue
    };
  }
  parseReferences(input) {
    const { regexes } = this;
    const regex = input.match(regexes.references) ? regexes.references : /()(.+)/gi;
    const references = [];
    let matches;
    let action;
    let sentence;
    let reference;
    while (true) {
      matches = regex.exec(input);
      if (!matches) {
        break;
      }
      action = matches[1] || null;
      sentence = matches[2] || "";
      while (true) {
        reference = this.parseReference(sentence, action);
        if (!reference) {
          break;
        }
        references.push(reference);
      }
    }
    return references;
  }
  skipEmptyLines() {
    let line = this.currentLine();
    while (line !== void 0 && !line.trim()) {
      this.nextLine();
      line = this.currentLine();
    }
  }
  parseMerge() {
    const { commit, options: options2 } = this;
    const correspondence = options2.mergeCorrespondence || [];
    const merge = this.currentLine();
    const matches = merge && options2.mergePattern ? merge.match(options2.mergePattern) : null;
    if (matches) {
      this.nextLine();
      commit.merge = matches[0] || null;
      assignMatchedCorrespondence(commit, matches, correspondence);
      return true;
    }
    return false;
  }
  parseHeader(isMergeCommit) {
    if (isMergeCommit) {
      this.skipEmptyLines();
    }
    const { commit, options: options2 } = this;
    const correspondence = options2.headerCorrespondence || [];
    const header = commit.header ?? this.nextLine();
    let matches = null;
    if (header) {
      if (options2.breakingHeaderPattern) {
        matches = header.match(options2.breakingHeaderPattern);
      }
      if (!matches && options2.headerPattern) {
        matches = header.match(options2.headerPattern);
      }
    }
    if (header) {
      commit.header = header;
    }
    if (matches) {
      assignMatchedCorrespondence(commit, matches, correspondence);
    }
  }
  parseMeta() {
    const { options: options2, commit } = this;
    if (!options2.fieldPattern || !this.isLineAvailable()) {
      return false;
    }
    let matches;
    let field = null;
    let parsed = false;
    while (this.isLineAvailable()) {
      matches = this.currentLine().match(options2.fieldPattern);
      if (matches) {
        field = matches[1] || null;
        this.nextLine();
        continue;
      }
      if (field) {
        parsed = true;
        commit[field] = appendLine(commit[field], this.currentLine());
        this.nextLine();
      } else {
        break;
      }
    }
    return parsed;
  }
  parseNotes() {
    const { regexes, commit } = this;
    if (!this.isLineAvailable()) {
      return false;
    }
    const matches = this.currentLine().match(regexes.notes);
    let isFooterToken;
    if (matches) {
      const note = {
        title: matches[1],
        text: matches[2]
      };
      commit.notes.push(note);
      commit.footer = appendLine(commit.footer, this.currentLine());
      this.nextLine();
      while (this.isLineAvailable()) {
        if (this.parseMeta()) {
          return true;
        }
        if (this.parseNotes()) {
          return true;
        }
        isFooterToken = regexes.footerToken.test(this.currentLine());
        commit.references.push(...this.parseReferences(this.currentLine()));
        if (!isFooterToken) {
          note.text = appendLine(note.text, this.currentLine());
        }
        commit.footer = appendLine(commit.footer, this.currentLine());
        this.nextLine();
        if (isFooterToken) {
          break;
        }
      }
      return true;
    }
    return false;
  }
  parseBodyAndFooter(isBody) {
    const { commit, regexes } = this;
    if (!this.isLineAvailable()) {
      return isBody;
    }
    const isFooterToken = regexes.footerToken.test(this.currentLine());
    const isStillBody = !isFooterToken && isBody;
    commit.references.push(...this.parseReferences(this.currentLine()));
    if (isStillBody) {
      commit.body = appendLine(commit.body, this.currentLine());
    } else {
      commit.footer = appendLine(commit.footer, this.currentLine());
    }
    this.nextLine();
    return isStillBody;
  }
  parseBreakingHeader() {
    const { commit, options: options2 } = this;
    if (!options2.breakingHeaderPattern || commit.notes.length || !commit.header) {
      return;
    }
    const matches = commit.header.match(options2.breakingHeaderPattern);
    if (matches) {
      commit.notes.push({
        title: "BREAKING CHANGE",
        text: matches[3]
      });
    }
  }
  parseMentions(input) {
    const { commit, regexes } = this;
    let matches;
    for (; ; ) {
      matches = regexes.mentions.exec(input);
      if (!matches) {
        break;
      }
      commit.mentions.push(matches[1]);
    }
  }
  parseRevert(input) {
    const { commit, options: options2 } = this;
    const correspondence = options2.revertCorrespondence || [];
    const matches = options2.revertPattern ? input.match(options2.revertPattern) : null;
    if (matches) {
      commit.revert = assignMatchedCorrespondence({}, matches, correspondence);
    }
  }
  cleanupCommit() {
    const { commit } = this;
    commit.body &&= trimNewLines(commit.body);
    commit.footer &&= trimNewLines(commit.footer);
    commit.notes.forEach((note) => {
      note.text = trimNewLines(note.text);
    });
    const referencesSet = /* @__PURE__ */ new Set();
    commit.references = commit.references.filter((reference) => {
      const uid = `${reference.action} ${reference.raw}`.toLocaleLowerCase();
      const ok = !referencesSet.has(uid);
      if (ok) {
        referencesSet.add(uid);
      }
      return ok;
    });
  }
  /**
   * Parse commit message string into an object.
   * @param input - Commit message string.
   * @returns Commit object.
   */
  parse(input) {
    if (!input.trim()) {
      throw new TypeError("Expected a raw commit");
    }
    const { commentChar } = this.options;
    const commentFilter = getCommentFilter(commentChar);
    const rawLines = trimNewLines(input).split(/\r?\n/);
    const lines = commentChar ? truncateToScissor(rawLines, commentChar).filter((line) => commentFilter(line) && gpgFilter(line)) : rawLines.filter((line) => gpgFilter(line));
    const commit = createCommitObject();
    this.lines = lines;
    this.lineIndex = 0;
    this.commit = commit;
    const isMergeCommit = this.parseMerge();
    this.parseHeader(isMergeCommit);
    if (commit.header) {
      commit.references = this.parseReferences(commit.header);
    }
    let isBody = true;
    while (this.isLineAvailable()) {
      this.parseMeta();
      if (this.parseNotes()) {
        isBody = false;
      }
      if (!this.parseBodyAndFooter(isBody)) {
        isBody = false;
      }
    }
    this.parseBreakingHeader();
    this.parseMentions(input);
    this.parseRevert(input);
    this.cleanupCommit();
    return commit;
  }
};

// src/validate.js
var types = /* @__PURE__ */ new Set([
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test"
]);
var options = {
  headerPattern: /^([a-z]+)(?:\(([^()\r\n]+)\))?(!)?: (\S[^\r\n]*)$/i,
  headerCorrespondence: ["type", "scope", "breaking", "subject"],
  noteKeywords: ["BREAKING CHANGE", "BREAKING-CHANGE", "Security", "Deprecated"],
  notesPattern: (keywords) => new RegExp(`^(${keywords})(?::(?:[ \\t]+|(?=$))| #)(.*)$`, "i"),
  fieldPattern: /(?!)/
};
function validate({ title, body = "" } = {}) {
  if (typeof title !== "string" || !title.trim()) {
    return ["Provide a Conventional PR title, for example: fix(parser): reject invalid input."];
  }
  if (body === null) body = "";
  if (typeof body !== "string") return ["PR body must be text or null."];
  if (/[\r\n]/.test(title)) return ["Keep the PR title on one line."];
  const parser = new CommitParser(options);
  const commit = parser.parse(`${title}

${body}`);
  const errors = [];
  if (!commit.type || !commit.subject?.trim() || commit.scope !== null && !commit.scope.trim()) {
    errors.push("Use type(scope): description, with an optional scope and ! immediately before the colon.");
  } else if (!types.has(commit.type)) {
    errors.push(`Use a lowercase type: ${[...types].join(", ")}.`);
  }
  for (const line of body.split(/\r?\n/)) {
    if (/^(?:BREAKING[ -]CHANGE|Security|Deprecated):\S/i.test(line)) {
      errors.push("Put a space after the annotation colon, for example: Security: explanation.");
    }
    if (/^BREAKING[ -]CHANGE #/i.test(line)) {
      errors.push("Use a colon and space for a breaking footer: BREAKING CHANGE: explanation.");
    }
  }
  const explanation = commit.body?.replace(/\r\n/g, "\n").trim();
  if (explanation) {
    const headings = explanation.match(/^## .*$/gm) ?? [];
    if (!explanation.startsWith("## Summary\n\n") || !["## Summary", "## Summary|## Details"].includes(headings.join("|"))) {
      errors.push("Start the explanation with ## Summary, then optionally ## Details. Use ### for subsections; indent literal examples of these reserved headings.");
    } else {
      const sections = explanation.replace(/^## Summary\n\n/, "").split("\n\n## Details\n\n");
      if (sections.some((section) => !section.trim()) || headings.length === 2 && sections.length !== 2) {
        errors.push("Give each section content and separate its heading with blank lines. Omit Details when there is nothing to add.");
      }
    }
  }
  const breaking = commit.notes.filter((note) => /^BREAKING[ -]CHANGE$/i.test(note.title));
  if (commit.breaking && !breaking.length) {
    errors.push("The title has !; add BREAKING CHANGE: explaining the affected contract and migration.");
  }
  if (breaking.length && !commit.breaking) {
    errors.push("The body declares a breaking change; add ! immediately before the title colon.");
  }
  for (const note of commit.notes) {
    if (/^BREAKING[ -]CHANGE$/i.test(note.title) && note.title !== note.title.toUpperCase()) {
      errors.push("Write the breaking footer token in uppercase: BREAKING CHANGE: or BREAKING-CHANGE:.");
    }
    if (!note.text?.trim()) {
      errors.push(`${note.title}: needs an explanation; remove an optional annotation when it does not apply.`);
    }
  }
  if (commit.footer) {
    const lines = body.replace(/\r\n/g, "\n").split("\n");
    const first = commit.footer.split("\n")[0];
    const start = lines.indexOf(first);
    if (start > 0 && lines[start - 1].trim()) {
      errors.push("Separate the footer section from the explanation with a blank line.");
    }
  }
  return [...new Set(errors)];
}

// src/index.js
try {
  if (!process.env.GITHUB_EVENT_PATH) throw new Error("A pull request event is required.");
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  if (!event.pull_request) throw new Error("A pull request event is required.");
  const errors = validate(event.pull_request);
  for (const error of errors) {
    const message = error.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
    console.error(`::error title=Conventional PR::${message}`);
  }
  if (errors.length) process.exitCode = 1;
} catch {
  console.error("::error title=Conventional PR::Could not read a valid pull request event.");
  process.exitCode = 1;
}
