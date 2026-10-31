import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { KnowledgeClient, KnowledgeDocument, KnowledgeListQuery, KnowledgePreview, KnowledgeSource, KnowledgeView } from './types';
import { knowledgeError } from './model';

export function useKnowledgeReview(client: KnowledgeClient) {
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied' | 'error'>('loading');
  const [accessError, setAccessError] = useState('');
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [view, setView] = useState<KnowledgeView>('pending');
  const [section, setSection] = useState<KnowledgeListQuery['section']>();
  const [search, setSearch] = useState(''); const [debouncedSearch, setDebouncedSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState('');
  const [selected, setSelected] = useState<KnowledgeDocument | null>(null);
  const [preview, setPreview] = useState<KnowledgePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false); const [previewError, setPreviewError] = useState('');
  const listSequence = useRef(0), detailSequence = useRef(0);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const listAbort = useRef<AbortController | null>(null), detailAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true); const moreBusy = useRef(false), refreshBusy = useRef(false);
  const [accessAttempt, setAccessAttempt] = useState(0);
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    const abort = new AbortController(); setAccess('loading'); setAccessError('');
    client.config(abort.signal).then(config => { if (!abort.signal.aborted) setAccess(config.canManage ? 'allowed' : 'denied'); })
      .catch(error => { if (!abort.signal.aborted) { setAccessError(knowledgeError(error)); setAccess('error'); } });
    return () => abort.abort();
  }, [client, accessAttempt]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; listSequence.current++; detailSequence.current++; listAbort.current?.abort(); detailAbort.current?.abort(); }; }, []);
  const query = useMemo(() => ({ view, section, q: debouncedSearch }), [view, section, debouncedSearch]);
  const refresh = useCallback(async (quiet = false) => {
    if (access !== 'allowed' || quiet && refreshBusy.current) return;
    refreshBusy.current = true;
    const generation = ++listSequence.current; listAbort.current?.abort(); const abort = new AbortController(); listAbort.current = abort;
    if (!quiet) setLoading(true);
    setLoadingMore(false); moreBusy.current = false;
    try {
      const [page, sourceList, current] = await Promise.all([
        client.documents(query, abort.signal), client.sources(abort.signal),
        selectedRef.current ? client.document(selectedRef.current.id, abort.signal) : Promise.resolve(null),
      ]);
      if (abort.signal.aborted || generation !== listSequence.current) return;
      setDocuments(page.documents); setNextCursor(page.nextCursor); setSources(sourceList); setListError('');
      if (current && current.id === selectedRef.current?.id) {
        setSelected(current);
        // Update metadata only. Never silently substitute the text being reviewed.
        setPreview(previous => previous?.document.id === current.id ? { ...previous, document: current } : previous);
      }
    } catch (error) { if (!abort.signal.aborted && generation === listSequence.current) setListError(knowledgeError(error)); }
    finally { if (generation === listSequence.current && mounted.current) { refreshBusy.current = false; setLoading(false); } }
  }, [access, client, query]);
  useEffect(() => { setDocuments([]); setNextCursor(null); void refresh(); return () => { listSequence.current++; listAbort.current?.abort(); }; }, [refresh]);
  // Poll only the first page: refreshing must not discard extra pages while someone is reading them.
  const [extraPages, setExtraPages] = useState(false);
  useEffect(() => { setExtraPages(false); }, [query]);
  useEffect(() => {
    if (access !== 'allowed') return;
    const timer = setInterval(() => {
      if (AppState.currentState === 'background' || AppState.currentState === 'inactive' || moreBusy.current) return;
      if (!extraPages) void refresh(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [access, extraPages, refresh]);
  const loadMore = async () => {
    if (!nextCursor || moreBusy.current || loading) return;
    moreBusy.current = true; setLoadingMore(true); const generation = listSequence.current;
    try {
      const page = await client.documents({ ...query, cursor: nextCursor }, listAbort.current?.signal);
      if (generation !== listSequence.current || !mounted.current) return;
      setDocuments(previous => [...previous, ...page.documents.filter(item => !previous.some(old => old.id === item.id))]);
      setNextCursor(page.nextCursor); setExtraPages(true); setListError('');
    } catch (error) { if (generation === listSequence.current && mounted.current) setListError(knowledgeError(error)); }
    finally { if (generation === listSequence.current && mounted.current) { moreBusy.current = false; setLoadingMore(false); } }
  };
  const open = useCallback(async (document: KnowledgeDocument, revision = document.currentRevision) => {
    const generation = ++detailSequence.current; detailAbort.current?.abort(); const abort = new AbortController(); detailAbort.current = abort;
    selectedRef.current = document; setSelected(document); setPreview(null); setPreviewError(''); setPreviewLoading(true);
    try {
      const result = await client.preview(document.id, revision, abort.signal);
      if (abort.signal.aborted || generation !== detailSequence.current) return;
      setPreview(result); setSelected(result.document); selectedRef.current = result.document;
    } catch (error) { if (!abort.signal.aborted && generation === detailSequence.current) setPreviewError(knowledgeError(error)); }
    finally { if (generation === detailSequence.current && mounted.current) setPreviewLoading(false); }
  }, [client]);
  const close = () => { detailSequence.current++; detailAbort.current?.abort(); selectedRef.current = null; setSelected(null); setPreview(null); setPreviewLoading(false); };
  const afterMutation = async (id: string, reloadText = false) => {
    const latest = await client.document(id);
    if (!mounted.current) return;
    if (selectedRef.current?.id === id) { setSelected(latest); setPreview(previous => previous?.document.id === id ? { ...previous, document: latest } : previous); }
    if (reloadText && selectedRef.current?.id === id) await open(latest);
    await refresh(true); setExtraPages(false);
  };
  return { access, accessError, retryAccess: () => setAccessAttempt(value => value + 1), sources, documents, view, setView, section, setSection, search, setSearch,
    loading, loadingMore, nextCursor, loadMore, listError, refresh, selected, preview, previewLoading, previewError, open, close, afterMutation };
}
