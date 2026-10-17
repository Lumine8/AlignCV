// Configurable skill dictionary with legitimate aliases.
// Aliases only group genuine spellings/abbreviations of the *same* technology.
// Distinct-but-related technologies are never merged.

export const SKILL_ALIASES = {
  // Languages
  Python: ["python", "python3"],
  JavaScript: ["javascript", "js", "ecmascript"],
  TypeScript: ["typescript", "ts"],
  Java: ["java"],
  "C++": ["c++", "cpp"],
  "C#": ["c#", "csharp"],
  C: ["c"],
  Go: ["golang", "go lang"],
  Rust: ["rust"],
  Ruby: ["ruby"],
  PHP: ["php"],
  Kotlin: ["kotlin"],
  Swift: ["swift"],
  Scala: ["scala"],
  R: ["r"],
  MATLAB: ["matlab"],
  SQL: ["sql"],
  Bash: ["bash", "shell scripting", "shell"],
  // Web / frontend
  React: ["react", "react.js", "reactjs"],
  Angular: ["angular", "angularjs"],
  Vue: ["vue", "vue.js", "vuejs"],
  "Next.js": ["next.js", "nextjs"],
  "Node.js": ["node.js", "nodejs", "node"],
  Express: ["express", "express.js", "expressjs"],
  Django: ["django"],
  Flask: ["flask"],
  FastAPI: ["fastapi"],
  Spring: ["spring", "spring boot", "springboot"],
  "REST API": ["rest api", "restful api", "restful", "rest apis", "rest"],
  GraphQL: ["graphql"],
  HTML: ["html", "html5"],
  CSS: ["css", "css3"],
  Sass: ["sass", "scss"],
  Redux: ["redux"],
  Webpack: ["webpack"],
  Vite: ["vite"],
  // Databases / data
  PostgreSQL: ["postgresql", "postgres", "psql"],
  MySQL: ["mysql"],
  MongoDB: ["mongodb", "mongo"],
  Redis: ["redis"],
  SQLite: ["sqlite"],
  Elasticsearch: ["elasticsearch", "elastic search"],
  "SQL Server": ["sql server", "mssql", "microsoft sql server"],
  Oracle: ["oracle db", "oracle database"],
  Cassandra: ["cassandra"],
  DynamoDB: ["dynamodb"],
  Snowflake: ["snowflake"],
  BigQuery: ["bigquery"],
  // Cloud / devops
  AWS: ["aws", "amazon web services"],
  Azure: ["azure", "microsoft azure"],
  GCP: ["gcp", "google cloud", "google cloud platform"],
  Docker: ["docker"],
  Kubernetes: ["kubernetes", "k8s"],
  Terraform: ["terraform"],
  Ansible: ["ansible"],
  Jenkins: ["jenkins"],
  "CI/CD": ["ci/cd", "ci cd", "continuous integration", "continuous deployment", "continuous delivery"],
  "GitHub Actions": ["github actions"],
  "GitLab CI": ["gitlab ci", "gitlab ci/cd"],
  Linux: ["linux", "unix"],
  Git: ["git"],
  Nginx: ["nginx"],
  Kafka: ["kafka", "apache kafka"],
  RabbitMQ: ["rabbitmq"],
  Prometheus: ["prometheus"],
  Grafana: ["grafana"],
  Datadog: ["datadog"],
  Serverless: ["serverless", "lambda", "aws lambda", "cloud functions"],
  // ML / AI
  "Machine Learning": ["machine learning", "ml"],
  "Deep Learning": ["deep learning", "dl"],
  "Artificial Intelligence": ["artificial intelligence", "ai"],
  "Natural Language Processing": ["natural language processing", "nlp"],
  "Computer Vision": ["computer vision", "cv", "image processing"],
  TensorFlow: ["tensorflow", "tf"],
  PyTorch: ["pytorch", "torch"],
  Keras: ["keras"],
  "scikit-learn": ["scikit-learn", "sklearn", "scikit learn"],
  Pandas: ["pandas"],
  NumPy: ["numpy"],
  SciPy: ["scipy"],
  "Hugging Face": ["hugging face", "huggingface", "transformers library"],
  LLM: ["llm", "large language model", "large language models"],
  RAG: ["rag", "retrieval augmented generation"],
  LangChain: ["langchain"],
  OpenCV: ["opencv"],
  Spark: ["spark", "apache spark", "pyspark"],
  Hadoop: ["hadoop"],
  Airflow: ["airflow", "apache airflow"],
  MLOps: ["mlops"],
  "Data Engineering": ["data engineering"],
  "Data Analysis": ["data analysis", "data analytics"],
  Statistics: ["statistics", "statistical analysis"],
  "Reinforcement Learning": ["reinforcement learning", "rl"],
  "Generative AI": ["generative ai", "genai"],
  "Prompt Engineering": ["prompt engineering"],
  // Practices / tools
  Agile: ["agile", "scrum"],
  "Unit Testing": ["unit testing", "unit tests", "pytest", "jest"],
  "Test Automation": ["test automation", "automated testing"],
  Microservices: ["microservices", "microservice architecture"],
  "System Design": ["system design", "distributed systems"],
  "Algorithm Design": ["algorithms", "data structures", "algorithm design"],
  "Project Management": ["project management"],
  Communication: ["communication", "written communication", "verbal communication"],
  Leadership: ["leadership", "team leadership"],
  "Problem Solving": ["problem solving", "problem-solving"],
};

const LOOKUP = {};
for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
  LOOKUP[canonical.toLowerCase()] = canonical;
  for (const alias of aliases) LOOKUP[alias.toLowerCase()] = canonical;
}

export function canonicalSkill(term) {
  const key = (term || "").trim().toLowerCase().replace(/\s+/g, " ");
  return LOOKUP[key] || (term || "").trim();
}

export function isKnownSkill(term) {
  return Object.prototype.hasOwnProperty.call(LOOKUP, (term || "").trim().toLowerCase());
}

export function surfaceForms(term) {
  const canonical = canonicalSkill(term);
  const forms = new Set([(term || "").trim().toLowerCase(), canonical.toLowerCase()]);
  for (const alias of SKILL_ALIASES[canonical] || []) forms.add(alias.toLowerCase());
  return [...forms].sort();
}

export const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "will", "are", "our", "that", "this",
  "have", "from", "your", "their", "they", "team", "work", "role", "job",
  "ability", "experience", "years", "using", "strong", "good", "must",
  "including", "such", "across", "within", "also", "well", "new", "other",
  "more", "into", "than", "them", "over", "when", "what", "which", "who",
  "how", "all", "any", "can", "may", "not", "but", "out", "one", "two",
  "preferred", "required", "plus", "etc", "e.g", "i.e", "via", "per",
]);

export function tokenize(text) {
  const tokens = (text || "").toLowerCase().match(/[a-zA-Z][a-zA-Z0-9+#.\-]{1,}/g) || [];
  return tokens.filter((t) => !STOPWORDS.has(t) && t.length > 1);
}
