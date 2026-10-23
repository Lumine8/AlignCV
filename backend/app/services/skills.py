"""Skill dictionary shared by job extraction and matching.

Aliases group genuine spellings of the same technology; related-but-different
technologies are never merged.
"""

from __future__ import annotations

import re

SKILL_ALIASES: dict[str, list[str]] = {
    # Languages
    "Python": ["python", "python3"],
    "JavaScript": ["javascript", "js", "ecmascript"],
    "TypeScript": ["typescript", "ts"],
    "Java": ["java"],
    "C++": ["c++", "cpp"],
    "C#": ["c#", "csharp"],
    "C": ["c"],
    "Go": ["golang", "go lang"],
    "Rust": ["rust"],
    "Ruby": ["ruby"],
    "PHP": ["php"],
    "Kotlin": ["kotlin"],
    "Swift": ["swift"],
    "Scala": ["scala"],
    "R": ["r"],
    "MATLAB": ["matlab"],
    "SQL": ["sql"],
    "Bash": ["bash", "shell scripting", "shell"],
    # Web / frontend
    "React": ["react", "react.js", "reactjs"],
    "Angular": ["angular", "angularjs"],
    "Vue": ["vue", "vue.js", "vuejs"],
    "Next.js": ["next.js", "nextjs"],
    "Node.js": ["node.js", "nodejs", "node"],
    "Express": ["express", "express.js", "expressjs"],
    "Django": ["django"],
    "Flask": ["flask"],
    "FastAPI": ["fastapi"],
    "Spring": ["spring", "spring boot", "springboot"],
    "REST API": ["rest api", "restful api", "restful", "rest apis", "rest"],
    "GraphQL": ["graphql"],
    "HTML": ["html", "html5"],
    "CSS": ["css", "css3"],
    "Sass": ["sass", "scss"],
    "Redux": ["redux"],
    "Webpack": ["webpack"],
    "Vite": ["vite"],
    # Databases / data
    "PostgreSQL": ["postgresql", "postgres", "psql"],
    "MySQL": ["mysql"],
    "MongoDB": ["mongodb", "mongo"],
    "Redis": ["redis"],
    "SQLite": ["sqlite"],
    "Elasticsearch": ["elasticsearch", "elastic search"],
    "SQL Server": ["sql server", "mssql", "microsoft sql server"],
    "Oracle": ["oracle db", "oracle database"],
    "Cassandra": ["cassandra"],
    "DynamoDB": ["dynamodb"],
    "Snowflake": ["snowflake"],
    "BigQuery": ["bigquery"],
    # Cloud / devops
    "AWS": ["aws", "amazon web services"],
    "Azure": ["azure", "microsoft azure"],
    "GCP": ["gcp", "google cloud", "google cloud platform"],
    "Docker": ["docker"],
    "Kubernetes": ["kubernetes", "k8s"],
    "Terraform": ["terraform"],
    "Ansible": ["ansible"],
    "Jenkins": ["jenkins"],
    "CI/CD": ["ci/cd", "ci cd", "continuous integration", "continuous deployment", "continuous delivery"],
    "GitHub Actions": ["github actions"],
    "GitLab CI": ["gitlab ci", "gitlab ci/cd"],
    "Linux": ["linux", "unix"],
    "Git": ["git"],
    "Nginx": ["nginx"],
    "Kafka": ["kafka", "apache kafka"],
    "RabbitMQ": ["rabbitmq"],
    "Prometheus": ["prometheus"],
    "Grafana": ["grafana"],
    "Datadog": ["datadog"],
    "Serverless": ["serverless", "lambda", "aws lambda", "cloud functions"],
    # ML / AI
    "Machine Learning": ["machine learning", "ml"],
    "Deep Learning": ["deep learning", "dl"],
    "Artificial Intelligence": ["artificial intelligence", "ai"],
    "Natural Language Processing": ["natural language processing", "nlp"],
    "Computer Vision": ["computer vision", "cv", "image processing"],
    "TensorFlow": ["tensorflow", "tf"],
    "PyTorch": ["pytorch", "torch"],
    "Keras": ["keras"],
    "scikit-learn": ["scikit-learn", "sklearn", "scikit learn"],
    "Pandas": ["pandas"],
    "NumPy": ["numpy"],
    "SciPy": ["scipy"],
    "Hugging Face": ["hugging face", "huggingface", "transformers library"],
    "LLM": ["llm", "large language model", "large language models"],
    "RAG": ["rag", "retrieval augmented generation"],
    "LangChain": ["langchain"],
    "OpenCV": ["opencv"],
    "Spark": ["spark", "apache spark", "pyspark"],
    "Hadoop": ["hadoop"],
    "Airflow": ["airflow", "apache airflow"],
    "MLOps": ["mlops"],
    "Data Engineering": ["data engineering"],
    "Data Analysis": ["data analysis", "data analytics"],
    "Statistics": ["statistics", "statistical analysis"],
    "Reinforcement Learning": ["reinforcement learning", "rl"],
    "Generative AI": ["generative ai", "genai"],
    "Prompt Engineering": ["prompt engineering"],
    # Practices / tools
    "Agile": ["agile", "scrum"],
    "Unit Testing": ["unit testing", "unit tests", "pytest", "jest"],
    "Test Automation": ["test automation", "automated testing"],
    "Microservices": ["microservices", "microservice architecture"],
    "System Design": ["system design", "distributed systems"],
    "Algorithm Design": ["algorithms", "data structures", "algorithm design"],
    "Project Management": ["project management"],
    "Communication": ["communication", "written communication", "verbal communication"],
    "Leadership": ["leadership", "team leadership"],
    "Problem Solving": ["problem solving", "problem-solving"],
}

LOOKUP: dict[str, str] = {}
for _canonical, _aliases in SKILL_ALIASES.items():
    LOOKUP[_canonical.lower()] = _canonical
    for _alias in _aliases:
        LOOKUP[_alias.lower()] = _canonical

STOPWORDS = {
    "the", "and", "for", "with", "you", "will", "are", "our", "that", "this",
    "have", "from", "your", "their", "they", "team", "work", "role", "job",
    "ability", "experience", "years", "using", "strong", "good", "must",
    "including", "such", "across", "within", "also", "well", "new", "other",
    "more", "into", "than", "them", "over", "when", "what", "which", "who",
    "how", "all", "any", "can", "may", "not", "but", "out", "one", "two",
    "preferred", "required", "plus", "etc", "e.g", "i.e", "via", "per",
}

_TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9+#.\-]{1,}")


def _clean(term: str | None) -> str:
    return " ".join((term or "").strip().lower().split())


def canonical_skill(term: str | None) -> str:
    cleaned = _clean(term)
    return LOOKUP.get(cleaned, (term or "").strip())


def is_known_skill(term: str | None) -> bool:
    return _clean(term) in LOOKUP


def surface_forms(term: str | None) -> list[str]:
    canonical = canonical_skill(term)
    forms = {_clean(term), canonical.lower()}
    forms.update(alias.lower() for alias in SKILL_ALIASES.get(canonical, []))
    return sorted(form for form in forms if form)


def tokenize(text: str | None) -> list[str]:
    tokens = [match.group(0).lower() for match in _TOKEN_RE.finditer(text or "")]
    return [token for token in tokens if token not in STOPWORDS and len(token) > 1]
