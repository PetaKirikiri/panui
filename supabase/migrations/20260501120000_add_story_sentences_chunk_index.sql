-- 0-based chunk index within (chapter_number, page_number), aligned with reader paragraph rows.
-- Keeps paragraph_number (1-based) for backward compatibility; chunk_index = paragraph_number - 1 for typical reader imports.

ALTER TABLE public.story_sentences
  ADD COLUMN IF NOT EXISTS chunk_index integer;

UPDATE public.story_sentences
SET chunk_index = GREATEST(0, COALESCE(paragraph_number, 1) - 1)
WHERE chunk_index IS NULL;

ALTER TABLE public.story_sentences
  ALTER COLUMN chunk_index SET DEFAULT 0;

ALTER TABLE public.story_sentences
  ALTER COLUMN chunk_index SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_story_sentences_source_chapter_page_chunk
  ON public.story_sentences (
    story_source_id,
    chapter_number,
    page_number,
    chunk_index,
    sentence_number
  );
