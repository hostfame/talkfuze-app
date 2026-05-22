-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    embedding vector(1536),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_knowledge_base ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read and write (or customize as needed)
CREATE POLICY "Allow authenticated read access on ai_knowledge_base"
    ON ai_knowledge_base FOR SELECT
    USING (true);

CREATE POLICY "Allow authenticated insert access on ai_knowledge_base"
    ON ai_knowledge_base FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow authenticated update access on ai_knowledge_base"
    ON ai_knowledge_base FOR UPDATE
    USING (true);

CREATE POLICY "Allow authenticated delete access on ai_knowledge_base"
    ON ai_knowledge_base FOR DELETE
    USING (true);

-- Create a function to search for knowledge
CREATE OR REPLACE FUNCTION match_knowledge (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  question TEXT,
  answer TEXT,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ai_knowledge_base.id,
    ai_knowledge_base.question,
    ai_knowledge_base.answer,
    1 - (ai_knowledge_base.embedding <=> query_embedding) AS similarity
  FROM ai_knowledge_base
  WHERE ai_knowledge_base.is_active = true 
    AND 1 - (ai_knowledge_base.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
