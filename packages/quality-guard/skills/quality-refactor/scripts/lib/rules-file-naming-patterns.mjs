export const NAMING_PATTERNS = {
  cs: [
    /\b(?:public|private|protected|internal|static|readonly|const|volatile|new)\s+[\w<>[\],.? ]+?\s+((?:m_|f_)[A-Za-z_]\w*)\s*(?:[;=,{])/g,
    /^[ \t]*(?:(?:static|readonly|const|volatile|new)\s+)*[\w<>[\],.?]+\s+((?:m_|f_)[A-Za-z_]\w*)\s*(?:[;=])/gm,
    /\b(?:public|private|protected|internal|static|readonly)\s+[\w<>[\],.? ]+?\s+((?:m_|f_)[A-Za-z_]\w*)\s*(?:\{|=>)/g,
  ],
  ts: [
    /^[ \t]*(?:(?:public|private|protected|readonly|static|declare|abstract)\s+)*((?:m_|f_)[A-Za-z_$][\w$]*)\s*!?\??\s*(?::|=|;)/gm,
  ],
  rs: [/^[ \t]*(?:pub(?:\([^)]*\))?\s+)?((?:m_|f_)[A-Za-z_]\w*)\s*:/gm],
};

export const PYTHON_MEMBER = /^\s*self\.((?:m_|f_)[A-Za-z_]\w*)\s*=/gm;
