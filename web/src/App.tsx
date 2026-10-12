import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  Clock3,
  FileText,
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Tickets,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { ApiError, api, json } from './api';

type Role = 'solicitante' | 'operador' | 'supervisor' | 'administrador';
type Status = 'aberto' | 'em_andamento' | 'aguardando' | 'resolvido' | 'encerrado';
type Result = 'respondido' | 'ambiguo' | 'sem_evidencia' | 'indisponivel';
type Section = 'assistant' | 'tickets' | 'account' | 'access';

type User = { id: string; name: string; email: string; role: Role };
type Ticket = {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: Status;
  version: number;
  createdAt: string;
  updatedAt: string;
};
type Event = {
  id: string;
  actorName: string;
  kind: string;
  content: string;
  fromStatus?: Status | null;
  toStatus?: Status | null;
  createdAt: string;
};
type Source = {
  id: string;
  title: string;
  kind: 'manual' | 'publico' | 'ticket';
  ticketId?: number;
  version?: number;
  excerpt: string;
  url?: string;
};
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  result?: Result;
  sources?: Source[];
  createdAt?: string;
};
type Conversation = { id: string; title: string; createdAt: string };
type Grant = { ticketId: number; userId: string; userName?: string; email?: string; createdAt?: string; active?: boolean };

const roleNames: Record<Role, string> = {
  solicitante: 'Solicitante',
  operador: 'Operador',
  supervisor: 'Supervisor',
  administrador: 'Administrador',
};
const statusNames: Record<Status, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  resolvido: 'Resolvido',
  encerrado: 'Encerrado',
};
const resultNames: Record<Result, string> = {
  respondido: 'Respondido com fontes',
  ambiguo: 'Precisa de esclarecimento',
  sem_evidencia: 'Sem evidência suficiente',
  indisponivel: 'Assistente indisponível',
};

function formatDate(value?: string) {
  if (!value) return 'Agora';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function roleCanOperate(role: Role) {
  return role !== 'solicitante';
}
function roleCanClose(role: Role) {
  return role === 'supervisor' || role === 'administrador';
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [booting, setBooting] = useState(true);
  const [section, setSection] = useState<Section>('assistant');
  const [ticketToOpen, setTicketToOpen] = useState<number | undefined>();
  const [shellError, setShellError] = useState('');

  useEffect(() => {
    api<{ user: User; providerConfigured: boolean }>('/auth/me')
      .then(({ user: currentUser, providerConfigured: configured }) => {
        setUser(currentUser);
        setProviderConfigured(configured);
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError) || error.status !== 401) {
          setShellError(error instanceof Error ? error.message : 'Não foi possível consultar a sessão.');
        }
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const expireSession = () => { setUser(null); setProviderConfigured(false); setSection('assistant'); };
    window.addEventListener('fluxsus:session-expired', expireSession);
    return () => window.removeEventListener('fluxsus:session-expired', expireSession);
  }, []);

  async function signIn(email: string, password: string) {
    const result = await api<{ user: User }>('/auth/login', json({ email, password }));
    const session = await api<{ user: User; providerConfigured: boolean }>('/auth/me');
    setUser(session.user ?? result.user);
    setProviderConfigured(session.providerConfigured);
    setShellError('');
  }

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // A sessão local é encerrada mesmo se a API estiver indisponível.
    } finally {
      setUser(null);
      setProviderConfigured(false);
      setSection('assistant');
    }
  }

  if (booting) return <div className="boot-screen"><LoaderCircle className="spin" aria-hidden="true" /><span>Preparando o ambiente…</span></div>;
  if (!user) return <LoginScreen onSignIn={signIn} apiError={shellError} />;

  return (
    <AppShell
      user={user}
      section={section}
      setSection={(next) => { setSection(next); setTicketToOpen(undefined); }}
      onSignOut={signOut}
      providerConfigured={providerConfigured}
    >
      {section === 'assistant' && (
        <AssistantView
          user={user}
          providerConfigured={providerConfigured}
          onOpenTicket={(id) => { setTicketToOpen(id); setSection('tickets'); }}
        />
      )}
      {section === 'tickets' && <TicketsView user={user} initialTicketId={ticketToOpen} />}
      {section === 'account' && <AccountView user={user} />}
      {section === 'access' && <AccessView />}
    </AppShell>
  );
}

function LoginScreen({ onSignIn, apiError }: { onSignIn: (email: string, password: string) => Promise<void>; apiError: string }) {
  const demoAccounts = [
    { name: 'Ana Ribeiro', role: 'Solicitante', email: 'ana@fluxsus.example' },
    { name: 'Bruno Costa', role: 'Solicitante', email: 'bruno@fluxsus.example' },
    { name: 'Carla Mendes', role: 'Operador', email: 'carla@fluxsus.example' },
    { name: 'Diego Lima', role: 'Operador', email: 'diego@fluxsus.example' },
    { name: 'Elisa Rocha', role: 'Supervisora', email: 'elisa@fluxsus.example' },
    { name: 'Fábio Alves', role: 'Supervisor', email: 'fabio@fluxsus.example' },
    { name: 'Gabriela Nunes', role: 'Administradora', email: 'gabriela@fluxsus.example' },
    { name: 'Henrique Souza', role: 'Administrador', email: 'henrique@fluxsus.example' },
  ];
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(apiError);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSignIn(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar. Verifique seus dados.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="brand-lockup">
          <span className="brand-mark"><Activity size={22} aria-hidden="true" /></span>
          <span>Fluxsus <strong>AI Lab</strong></span>
        </div>
        <div className="login-copy">
          <p className="eyebrow">Ambiente demonstrativo</p>
          <h1 id="login-title">Acompanhe cada solicitação com contexto.</h1>
          <p>Entre para consultar tickets e conversar com o assistente de operações.</p>
        </div>
        <form className="form-stack" onSubmit={submit}>
          <Field label="Conta de demonstração" htmlFor="email">
            <select id="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)}>
              {demoAccounts.map((account) => <option key={account.email} value={account.email}>{account.name} · {account.role}</option>)}
            </select>
          </Field>
          <Field label="Senha" htmlFor="password">
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" />
          </Field>
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
          <button className="button button-primary button-full" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}
            Entrar no ambiente
          </button>
        </form>
        <p className="demo-credential"><KeyRound size={15} aria-hidden="true" /> Senha comum das contas de demonstração: <code>Demo!Fluxsus2026</code></p>
        <p className="login-help"><CircleHelp size={15} aria-hidden="true" /> As contas e os tickets exibidos aqui são fictícios.</p>
      </section>
      <aside className="login-aside" aria-label="Informações do ambiente">
        <div className="aside-orbit orbit-one" />
        <div className="aside-orbit orbit-two" />
        <div className="aside-content">
          <div className="status-stamp"><span className="status-dot" /> Dados de demonstração</div>
          <div className="aside-graphic" aria-hidden="true">
            <div className="graphic-backdrop" />
            <div className="graphic-ticket"><span><TicketCheck size={21} /></span><div><b>Solicitação atualizada</b><i>Fontes vinculadas ao histórico</i></div><Check size={18} /></div>
            <div className="graphic-message"><Sparkles size={18} /><div><b>Contexto autorizado</b><i>Consulta validada para esta sessão</i></div></div>
            <div className="graphic-line"><span /><span /><span /></div>
          </div>
          <h2>Informação certa, para a pessoa certa.</h2>
          <p>O assistente consulta procedimentos e tickets permitidos para a sessão, com fontes visíveis na resposta.</p>
          <div className="aside-footer"><ShieldCheck size={17} /> Protótipo acadêmico sem dados da empresa</div>
        </div>
      </aside>
    </main>
  );
}

function AppShell({ user, section, setSection, onSignOut, providerConfigured, children }: {
  user: User; section: Section; setSection: (section: Section) => void; onSignOut: () => Promise<void>;
  providerConfigured: boolean; children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const navigation: { id: Section; label: string; icon: typeof MessageCircle }[] = [
    { id: 'assistant', label: 'Assistente', icon: MessageCircle },
    { id: 'tickets', label: 'Tickets', icon: Tickets },
    { id: 'account', label: 'Minha conta', icon: CircleUserRound },
    ...(user.role === 'administrador' ? [{ id: 'access' as const, label: 'Acessos', icon: UsersRound }] : []),
  ];
  const title = navigation.find((item) => item.id === section)?.label ?? 'Assistente';

  async function exit() {
    setSignOutBusy(true);
    try { await onSignOut(); } finally { setSignOutBusy(false); }
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`} aria-label="Navegação principal">
        <a className="brand-lockup app-brand" href="#main-content" onClick={(event) => event.preventDefault()}>
          <span className="brand-mark"><Activity size={21} aria-hidden="true" /></span><span>Fluxsus <strong>AI Lab</strong></span>
        </a>
        <div className="workspace-chip"><span className="workspace-avatar">F</span><span><b>Operações</b><small>Ambiente local</small></span><ChevronDown size={15} aria-hidden="true" /></div>
        <p className="nav-caption">Espaço de trabalho</p>
        <nav className="main-nav">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`nav-link ${section === id ? 'is-active' : ''}`} aria-current={section === id ? 'page' : undefined}
              onClick={() => { setSection(id); setMobileNavOpen(false); }}>
              <Icon size={18} aria-hidden="true" /><span>{label}</span>{section === id && <span className="nav-indicator" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <span className="help-icon"><LifeBuoy size={18} aria-hidden="true" /></span>
          <div><b>Precisa de ajuda?</b><p>Consulte os manuais pelo assistente.</p></div>
        </div>
        <div className="user-card">
          <span className="user-avatar">{initials(user.name)}</span>
          <span className="user-card-copy"><b>{user.name}</b><small>{roleNames[user.role]}</small></span>
          <button className="icon-button logout-button" type="button" aria-label="Sair" title="Sair" disabled={signOutBusy} onClick={exit}>
            {signOutBusy ? <LoaderCircle className="spin" size={17} /> : <LogOut size={17} />}
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <button className="mobile-menu icon-button" type="button" aria-label={mobileNavOpen ? 'Fechar navegação' : 'Abrir navegação'} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(!mobileNavOpen)}>
            {mobileNavOpen ? <X size={21} /> : <Settings2 size={21} />}
          </button>
          <div className="breadcrumb"><span>Fluxsus AI Lab</span><ChevronRight size={15} aria-hidden="true" /><strong>{title}</strong></div>
          <div className="topbar-right">
            <span className="demo-badge"><span className="status-dot" /> Dados fictícios</span>
            <span className={`provider-pill ${providerConfigured ? 'provider-ready' : 'provider-pending'}`} title={providerConfigured ? 'Provedor de IA configurado' : 'Chave do provedor ainda não configurada'}>
              <span className="provider-dot" />{providerConfigured ? 'Assistente conectado' : 'Assistente sem chave'}
            </span>
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      {mobileNavOpen && <button type="button" className="nav-scrim" aria-label="Fechar navegação" onClick={() => setMobileNavOpen(false)} />}
    </div>
  );
}

function AssistantView({ user, providerConfigured, onOpenTicket }: { user: User; providerConfigured: boolean; onOpenTicket: (id: number) => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sourceDetails, setSourceDetails] = useState<Record<string, Source>>({});
  const [sourceLoading, setSourceLoading] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasMessages = messages.length > 0;

  async function loadConversations(selectFirst = true) {
    const { conversations: items } = await api<{ conversations: Conversation[] }>('/conversations');
    setConversations(items);
    if (selectFirst && !conversationId && items[0]) {
      setConversationId(items[0].id);
      const result = await api<{ messages: Message[] }>(`/conversations/${encodeURIComponent(items[0].id)}`);
      setMessages(result.messages);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { conversations: items } = await api<{ conversations: Conversation[] }>('/conversations');
        if (!alive) return;
        setConversations(items);
        if (items[0]) {
          setConversationId(items[0].id);
          const result = await api<{ messages: Message[] }>(`/conversations/${encodeURIComponent(items[0].id)}`);
          if (alive) setMessages(result.messages);
        }
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as conversas.');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending]);

  async function selectConversation(id: string) {
    setConversationId(id);
    setError('');
    setLoading(true);
    try {
      const result = await api<{ messages: Message[] }>(`/conversations/${encodeURIComponent(id)}`);
      setMessages(result.messages);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível abrir esta conversa.'); }
    finally { setLoading(false); }
  }

  async function newConversation() {
    setError('');
    setLoading(true);
    try {
      const { conversation } = await api<{ conversation: Conversation }>('/conversations', { method: 'POST' });
      setConversationId(conversation.id);
      setMessages([]);
      setConversations((items) => [conversation, ...items]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar uma conversa.'); }
    finally { setLoading(false); }
  }

  async function sendMessage(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const content = (suggested ?? draft).trim();
    if (!content || sending) return;
    setError('');
    setSending(true);
    const optimisticId = `local-${Date.now()}`;
    setMessages((items) => [...items, { id: optimisticId, role: 'user', content, createdAt: new Date().toISOString() }]);
    setDraft('');
    try {
      let activeConversation = conversationId;
      if (!activeConversation) {
        const created = await api<{ conversation: Conversation }>('/conversations', { method: 'POST' });
        activeConversation = created.conversation.id;
        setConversationId(activeConversation);
        setConversations((items) => [created.conversation, ...items]);
      }
      const response = await api<{ conversationId: string; messageId: string; answer: string; result: Result; sources: Source[]; requestId: string }>(
        '/chat', json({ message: content, conversationId: activeConversation }),
      );
      setMessages((items) => [...items, {
        id: response.messageId,
        role: 'assistant',
        content: response.answer,
        result: response.result,
        sources: response.sources,
        createdAt: new Date().toISOString(),
      }]);
      if (response.conversationId) setConversationId(response.conversationId);
      try { await loadConversations(false); } catch { /* A mensagem continua disponível mesmo se a lista falhar. */ }
    } catch (cause) {
      setMessages((items) => items.filter((message) => message.id !== optimisticId));
      setDraft(content);
      setError(cause instanceof Error ? cause.message : 'A mensagem não foi enviada. Tente novamente.');
    } finally { setSending(false); }
  }

  async function revealSource(sourceId: string) {
    if (sourceDetails[sourceId]) {
      setSourceDetails((current) => { const next = { ...current }; delete next[sourceId]; return next; });
      return;
    }
    setSourceLoading(sourceId);
    try {
      const { source } = await api<{ source: Source }>(`/sources/${encodeURIComponent(sourceId)}`);
      setSourceDetails((current) => ({ ...current, [sourceId]: source }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Esta fonte não está mais disponível para sua sessão.'); }
    finally { setSourceLoading(null); }
  }

  return (
    <section className="assistant-layout" aria-label="Assistente de operações">
      <aside className="conversation-rail">
        <div className="rail-heading"><div><p className="eyebrow">Seu espaço</p><h1>Conversas</h1></div>
          <button className="icon-button new-conversation" type="button" title="Nova conversa" aria-label="Nova conversa" onClick={newConversation}><MessageSquarePlus size={18} /></button>
        </div>
        <button className="button button-primary new-chat-button" type="button" onClick={newConversation}><Plus size={16} /> Nova conversa</button>
        <div className="conversation-list" aria-label="Conversas anteriores">
          {conversations.length === 0 && !loading && <p className="muted-empty">Suas conversas aparecerão aqui.</p>}
          {conversations.map((conversation) => (
            <button key={conversation.id} type="button" className={`conversation-item ${conversation.id === conversationId ? 'is-selected' : ''}`} onClick={() => selectConversation(conversation.id)} aria-current={conversation.id === conversationId ? 'true' : undefined}>
              <MessageCircle size={16} aria-hidden="true" /><span><b>{conversation.title || 'Nova conversa'}</b><small>{formatDate(conversation.createdAt)}</small></span>
            </button>
          ))}
        </div>
        <div className="rail-note"><ShieldCheck size={17} /><span>Fontes e histórico respeitam seu acesso aos tickets.</span></div>
      </aside>

      <div className="assistant-main">
        <div className="assistant-heading">
          <div><p className="eyebrow">Atendimento com contexto</p><h2>Como posso ajudar, {user.name.split(' ')[0]}?</h2><p className="heading-subtitle">Pergunte sobre os procedimentos da plataforma ou sobre um ticket que você pode consultar.</p></div>
          <div className="assistant-symbol"><Sparkles size={20} aria-hidden="true" /></div>
        </div>
        {!providerConfigured && <div className="provider-notice" role="status"><span className="provider-notice-icon"><KeyRound size={16} /></span><span><b>Geração de respostas ainda não configurada.</b> Perguntas que precisam da DeepSeek ficarão indisponíveis. Consultas exatas de ticket podem usar o estado atual autorizado.</span></div>}
        {!hasMessages && !loading && (
          <div className="suggestion-area">
            <p className="suggestion-label">Comece por uma pergunta</p>
            <div className="suggestion-grid">
              <Suggestion onClick={() => sendMessage(undefined, 'Como posso mudar minha senha?')} icon={<KeyRound size={17} />} title="Conta e acesso" text="Como posso mudar minha senha?" />
              <Suggestion onClick={() => sendMessage(undefined, 'Como crio um ticket de solicitação?')} icon={<BookOpenText size={17} />} title="Uso da plataforma" text="Como crio um ticket de solicitação?" />
              <Suggestion onClick={() => sendMessage(undefined, 'O ticket 2233 já foi encerrado?')} icon={<TicketCheck size={17} />} title="Consultar ticket" text="O ticket 2233 já foi encerrado?" />
            </div>
          </div>
        )}
        <div className={`chat-stream ${hasMessages ? 'has-messages' : ''}`} aria-live="polite" aria-label="Mensagens da conversa">
          {loading && <div className="loading-row"><LoaderCircle className="spin" size={18} />Carregando conversa…</div>}
          {!loading && messages.map((message) => <ChatMessage key={message.id} message={message} onRevealSource={revealSource} details={sourceDetails} sourceLoading={sourceLoading} onOpenTicket={onOpenTicket} />)}
          {sending && <div className="assistant-message pending-message"><span className="assistant-mini-mark"><Sparkles size={15} /></span><div className="thinking-bubble"><span /><span /><span /><small>Consultando suas fontes autorizadas…</small></div></div>}
          <div ref={messagesEndRef} />
        </div>
        {error && <div className="chat-error" role="alert"><span>{error}</span><button type="button" className="icon-button" aria-label="Fechar aviso" onClick={() => setError('')}><X size={16} /></button></div>}
        <form className="composer" onSubmit={(event) => sendMessage(event)}>
          <label className="sr-only" htmlFor="chat-message">Escreva sua pergunta</label>
          <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Escreva sua pergunta…" rows={1} maxLength={2000} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
          }} />
          <div className="composer-footer"><span>Enter para enviar · Shift + Enter para nova linha</span>
            <button className="send-button" type="submit" disabled={sending || !draft.trim()} aria-label="Enviar mensagem">{sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button>
          </div>
        </form>
        <p className="assistant-disclaimer"><ShieldCheck size={14} /> Assistente de operações da plataforma. Não fornece orientação clínica.</p>
      </div>
    </section>
  );
}

function ChatMessage({ message, onRevealSource, details, sourceLoading, onOpenTicket }: {
  message: Message; onRevealSource: (id: string) => void; details: Record<string, Source>; sourceLoading: string | null; onOpenTicket: (id: number) => void;
}) {
  if (message.role === 'user') return (
    <article className="user-message"><div className="user-bubble">{message.content}</div><span className="message-time">{formatDate(message.createdAt)}</span></article>
  );
  return (
    <article className="assistant-message">
      <span className="assistant-mini-mark"><Sparkles size={15} aria-hidden="true" /></span>
      <div className="assistant-message-body">
        <div className="assistant-answer">{message.content}</div>
        {message.result && <div className={`result-line result-${message.result}`}><span className="result-marker" />{resultNames[message.result]}</div>}
        {!!message.sources?.length && <div className="sources-panel">
          <h3><BookOpenText size={15} aria-hidden="true" /> Fontes consultadas <span>{message.sources.length}</span></h3>
          <div className="source-list">
            {message.sources.map((source, index) => {
              const expanded = details[source.id];
              const working = sourceLoading === source.id;
              return <div className="source-wrap" key={`${source.id}-${index}`}>
                <button type="button" className="source-row" aria-expanded={Boolean(expanded)} onClick={() => void onRevealSource(source.id)}>
                  <span className={`source-type source-${source.kind}`}>{source.kind === 'ticket' ? <TicketCheck size={15} /> : source.kind === 'publico' ? <FileText size={15} /> : <BookOpenText size={15} />}</span>
                  <span className="source-copy"><b>{source.title}</b><small>{source.kind === 'ticket' ? `Ticket ${source.ticketId ?? ''}${source.version ? ` · versão ${source.version}` : ''}` : source.kind === 'publico' ? 'Referência pública' : 'Manual da plataforma'}</small></span>
                  {working ? <LoaderCircle className="spin" size={15} /> : expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
                {expanded && <div className="source-detail"><p>{expanded.excerpt || source.excerpt}</p>
                  {expanded.kind === 'ticket' && expanded.ticketId && <button type="button" className="text-link" onClick={() => onOpenTicket(expanded.ticketId!)}>Abrir ticket <ArrowRight size={14} /></button>}
                  {expanded.url && <a className="text-link" href={expanded.url} target="_blank" rel="noreferrer">Abrir referência pública <ArrowRight size={14} /></a>}
                </div>}
              </div>;
            })}
          </div>
        </div>}
        <span className="message-time">{formatDate(message.createdAt)}</span>
      </div>
    </article>
  );
}

function Suggestion({ onClick, icon, title, text }: { onClick: () => void; icon: ReactNode; title: string; text: string }) {
  return <button type="button" className="suggestion-card" onClick={onClick}><span className="suggestion-icon">{icon}</span><b>{title}</b><span>{text}</span><ArrowRight size={15} className="suggestion-arrow" aria-hidden="true" /></button>;
}

function TicketsView({ user, initialTicketId }: { user: User; initialTicketId?: number }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedId, setSelectedId] = useState<number | undefined>(initialTicketId);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [filter, setFilter] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitionStatus, setTransitionStatus] = useState<Status>('em_andamento');
  const [transitionContent, setTransitionContent] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshList(preferred?: number) {
    const { tickets: items } = await api<{ tickets: Ticket[] }>('/tickets');
    setTickets(items);
    const next = preferred ?? selectedId;
    if (next && items.some((ticket) => ticket.id === next)) setSelectedId(next);
    else if (items[0]) setSelectedId(items[0].id);
    else { setSelectedId(undefined); setSelected(null); setEvents([]); }
  }

  async function refreshDetail(id: number) {
    setLoadingDetail(true);
    try {
      const { ticket, events: history } = await api<{ ticket: Ticket; events: Event[] }>(`/tickets/${id}`);
      setSelected(ticket);
      setEvents(history);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Este ticket não está disponível para sua sessão.'); }
    finally { setLoadingDetail(false); }
  }

  useEffect(() => {
    let alive = true;
    api<{ tickets: Ticket[] }>('/tickets').then(({ tickets: items }) => {
      if (!alive) return;
      setTickets(items);
      const next = initialTicketId && items.some((ticket) => ticket.id === initialTicketId) ? initialTicketId : items[0]?.id;
      setSelectedId(next);
    }).catch((cause: unknown) => { if (alive) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os tickets.'); })
      .finally(() => { if (alive) setLoadingList(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (selectedId) void refreshDetail(selectedId); }, [selectedId]);

  const filtered = useMemo(() => {
    const normalized = filter.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return tickets;
    return tickets.filter((ticket) => `${ticket.id} ${ticket.title} ${ticket.category}`.toLocaleLowerCase('pt-BR').includes(normalized));
  }, [tickets, filter]);

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (!selected || !comment.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/tickets/${selected.id}/comments`, json({ content: comment.trim() }));
      setComment(''); setNotice('Comentário adicionado ao histórico.'); await Promise.all([refreshDetail(selected.id), refreshList(selected.id)]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o comentário.'); }
    finally { setBusy(false); }
  }

  async function submitTransition(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/tickets/${selected.id}/transition`, json({ status: transitionStatus, content: transitionContent.trim(), version: selected.version }));
      setTransitionOpen(false); setTransitionContent(''); setNotice(`Ticket atualizado para ${statusNames[transitionStatus].toLocaleLowerCase('pt-BR')}.`);
      await Promise.all([refreshDetail(selected.id), refreshList(selected.id)]);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 409 ? `${cause.message} A versão atual foi carregada.` : cause instanceof Error ? cause.message : 'Não foi possível atualizar o ticket.');
      await Promise.all([refreshDetail(selected.id), refreshList(selected.id)]);
    } finally { setBusy(false); }
  }

  function beginTransition(status: Status) { setTransitionStatus(status); setTransitionOpen(true); }

  return (
    <section className="tickets-page" aria-label="Tickets de serviço">
      <div className="page-heading tickets-page-heading"><div><p className="eyebrow">Solicitações de serviço</p><h1>Tickets</h1><p>Acompanhe o histórico e registre a próxima atualização.</p></div>
        <button className="button button-primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={17} /> Criar ticket</button>
      </div>
      {error && <InlineNotice tone="error" action={<button type="button" className="notice-action" onClick={() => { setError(''); void refreshList(); }}>Tentar novamente</button>}>{error}</InlineNotice>}
      {notice && <InlineNotice tone="success" action={<button type="button" className="notice-dismiss" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15} /></button>}>{notice}</InlineNotice>}
      <div className="ticket-workspace">
        <aside className="ticket-list-pane" aria-label="Lista de tickets">
          <div className="ticket-list-head"><div><b>Seus tickets</b><span>{tickets.length} acessíveis</span></div><button className="icon-button" type="button" aria-label="Atualizar lista" title="Atualizar lista" onClick={() => void refreshList()}><RefreshCw size={16} /></button></div>
          <label className="search-box"><span className="sr-only">Buscar ticket por número ou título</span><input type="search" placeholder="Buscar ticket…" value={filter} onChange={(event) => setFilter(event.target.value)} /><span aria-hidden="true">⌕</span></label>
          <div className="ticket-list-scroll">
            {loadingList && <div className="loading-row"><LoaderCircle className="spin" size={17} />Carregando tickets…</div>}
            {!loadingList && filtered.length === 0 && <div className="empty-list"><Tickets size={25} /><b>{tickets.length ? 'Nenhum resultado' : 'Nenhum ticket disponível'}</b><span>{tickets.length ? 'Tente buscar por outro número ou título.' : 'Crie um ticket para iniciar o acompanhamento.'}</span></div>}
            {filtered.map((ticket) => <button type="button" key={ticket.id} className={`ticket-row ${selectedId === ticket.id ? 'is-selected' : ''}`} onClick={() => { setSelectedId(ticket.id); setError(''); setNotice(''); }} aria-current={selectedId === ticket.id ? 'true' : undefined}>
              <span className={`ticket-row-marker marker-${ticket.status}`}><Tickets size={15} /></span><span className="ticket-row-content"><span className="ticket-row-top"><b>#{ticket.id}</b><small>{formatRelative(ticket.updatedAt)}</small></span><strong>{ticket.title}</strong><span className="ticket-row-bottom"><StatusBadge status={ticket.status} /><span>{ticket.category}</span></span></span>
            </button>)}
          </div>
        </aside>

        <div className="ticket-detail-pane">
          {loadingDetail && <div className="detail-loading"><LoaderCircle className="spin" size={20} />Carregando detalhes…</div>}
          {!loadingDetail && !selected && <div className="ticket-empty-detail"><TicketCheck size={34} /><h2>Selecione um ticket</h2><p>O detalhe e o histórico aparecerão aqui.</p></div>}
          {!loadingDetail && selected && <>
            <div className="ticket-detail-header">
              <button type="button" className="mobile-back text-link" onClick={() => setSelected(null)}><ArrowLeft size={15} /> Voltar à lista</button>
              <div className="detail-idline"><span>Ticket #{selected.id}</span><span className="detail-divider" /><span>Versão {selected.version}</span><span className="detail-divider" /><span>Atualizado {formatDate(selected.updatedAt)}</span></div>
              <div className="ticket-title-row"><div><h2>{selected.title}</h2><StatusBadge status={selected.status} /></div><span className={`priority-tag priority-${selected.priority.toLowerCase()}`}>Prioridade {selected.priority}</span></div>
              <p className="ticket-description">{selected.description}</p>
              <div className="ticket-meta"><span><FileText size={14} />{selected.category}</span><span><Clock3 size={14} />Criado {formatDate(selected.createdAt)}</span></div>
              {selected.status !== 'encerrado' && <div className="ticket-actions">
                {selected.status === 'aberto' && roleCanOperate(user.role) && <button className="button button-secondary" type="button" onClick={() => beginTransition('em_andamento')}>Iniciar atendimento</button>}
                {(selected.status === 'em_andamento' || selected.status === 'aguardando') && roleCanOperate(user.role) && <>
                  {selected.status === 'em_andamento' && <button className="button button-secondary" type="button" onClick={() => beginTransition('aguardando')}>Aguardar informação</button>}
                  {selected.status === 'aguardando' && <button className="button button-secondary" type="button" onClick={() => beginTransition('em_andamento')}>Retomar atendimento</button>}
                  <button className="button button-primary" type="button" onClick={() => beginTransition('resolvido')}><CheckCheck size={16} /> Resolver ticket</button>
                </>}
                {selected.status === 'resolvido' && roleCanClose(user.role) && <button className="button button-primary" type="button" onClick={() => beginTransition('encerrado')}><TicketCheck size={16} /> Encerrar ticket</button>}
              </div>}
            </div>
            <section className="timeline-section" aria-labelledby="timeline-heading">
              <div className="section-title-row"><div><h3 id="timeline-heading">Histórico do ticket</h3><p>Atualizações registradas em ordem cronológica.</p></div><span className="event-count">{events.length} {events.length === 1 ? 'registro' : 'registros'}</span></div>
              <div className="timeline">
                {events.map((item, index) => <TimelineEvent key={item.id} event={item} isLast={index === events.length - 1} />)}
                {events.length === 0 && <p className="muted-empty">Ainda não há atualizações neste ticket.</p>}
              </div>
            </section>
            {selected.status !== 'encerrado' && <form className="comment-box" onSubmit={submitComment}>
              <label htmlFor="ticket-comment">Adicionar comentário</label><textarea id="ticket-comment" value={comment} onChange={(event) => setComment(event.target.value)} minLength={3} maxLength={2000} rows={2} placeholder="Registre uma informação relevante para o acompanhamento…" />
              <div className="comment-footer"><span>Seu nome será registrado no histórico.</span><button className="button button-primary button-small" type="submit" disabled={busy || comment.trim().length < 3}>{busy ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />} Comentar</button></div>
            </form>}
          </>}
        </div>
      </div>
      {createOpen && <CreateTicketModal onClose={() => setCreateOpen(false)} onCreated={async (ticket) => { setCreateOpen(false); setNotice(`Ticket #${ticket.id} criado.`); await refreshList(ticket.id); }} />}
      {transitionOpen && selected && <TransitionModal ticket={selected} status={transitionStatus} content={transitionContent} setContent={setTransitionContent} onClose={() => setTransitionOpen(false)} onSubmit={submitTransition} busy={busy} />}
    </section>
  );
}

function CreateTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (ticket: Ticket) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Acesso à plataforma');
  const [priority, setPriority] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { ticket } = await api<{ ticket: Ticket }>('/tickets', json({ title: title.trim(), description: description.trim(), category, priority }));
      await onCreated(ticket);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível criar o ticket.'); }
    finally { setBusy(false); }
  }

  return <Modal title="Criar ticket" description="Descreva a solicitação para que a equipe possa acompanhar o andamento." onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <Field label="Título" htmlFor="new-ticket-title"><input id="new-ticket-title" required minLength={5} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Acesso ao painel de relatórios" /></Field>
      <Field label="Descrição" htmlFor="new-ticket-description"><textarea id="new-ticket-description" required minLength={10} maxLength={3000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Conte o que precisa e qual resultado espera." /></Field>
      <div className="field-row"><Field label="Categoria" htmlFor="new-ticket-category"><select id="new-ticket-category" value={category} onChange={(event) => setCategory(event.target.value)}><option>Acesso à plataforma</option><option>Solicitação de serviço</option><option>Erro ou instabilidade</option><option>Dúvida de uso</option><option>Outro</option></select></Field>
        <Field label="Prioridade" htmlFor="new-ticket-priority"><select id="new-ticket-priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option></select></Field></div>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <div className="modal-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancelar</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Criar ticket</button></div>
    </form>
  </Modal>;
}

function TransitionModal({ ticket, status, content, setContent, onClose, onSubmit, busy }: {
  ticket: Ticket; status: Status; content: string; setContent: (content: string) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; busy: boolean;
}) {
  const close = status === 'encerrado';
  const requiresText = status === 'resolvido';
  const minimumLength = requiresText ? 10 : 3;
  return <Modal title={close ? 'Encerrar ticket' : status === 'resolvido' ? 'Resolver ticket' : `Atualizar para ${statusNames[status].toLocaleLowerCase('pt-BR')}`} description={close ? 'O encerramento conclui este ticket e mantém o histórico disponível para consulta.' : 'A atualização ficará registrada na linha do tempo do ticket.'} onClose={onClose}>
    <form className="form-stack" onSubmit={onSubmit}>
      <div className="transition-summary"><span className={`ticket-row-marker marker-${status}`}><Tickets size={15} /></span><span><small>Ticket #{ticket.id}</small><b>{ticket.title}</b></span><ArrowRight size={17} /><StatusBadge status={status} /></div>
      <Field label={requiresText ? 'Descrição da resolução' : 'Comentário da atualização'} htmlFor="transition-content" hint={requiresText ? 'Mínimo de 10 caracteres.' : 'Mínimo de 3 caracteres.'}>
        <textarea id="transition-content" rows={3} required minLength={minimumLength} maxLength={2000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={requiresText ? 'Registre a solução aplicada…' : 'Adicione um detalhe para o histórico…'} />
      </Field>
      <div className="modal-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancelar</button><button className="button button-primary" type="submit" disabled={busy || content.trim().length < minimumLength}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{close ? 'Encerrar ticket' : status === 'resolvido' ? 'Confirmar resolução' : 'Atualizar ticket'}</button></div>
    </form>
  </Modal>;
}

function TimelineEvent({ event, isLast }: { event: Event; isLast: boolean }) {
  const transitionLabel = event.toStatus ? `alterou o status para ${statusNames[event.toStatus].toLocaleLowerCase('pt-BR')}` : event.kind === 'comment' || event.kind === 'comentario' ? 'adicionou um comentário' : event.kind.replaceAll('_', ' ');
  return <article className={`timeline-event ${isLast ? 'is-last' : ''}`}>
    <span className={`timeline-marker event-${event.kind}`}><EventIcon kind={event.kind} /></span>
    <div className="timeline-content"><div className="event-meta"><b>{event.actorName}</b><span>{transitionLabel}</span><time>{formatDate(event.createdAt)}</time></div>
      {event.content && <p>{event.content}</p>}{event.toStatus && <div className="event-status"><span>{event.fromStatus ? statusNames[event.fromStatus] : 'Início'}</span><ArrowRight size={13} /><StatusBadge status={event.toStatus} /></div>}
    </div>
  </article>;
}
function EventIcon({ kind }: { kind: string }) {
  if (kind.includes('resolve')) return <CheckCheck size={15} />;
  if (kind.includes('close') || kind.includes('encerr')) return <TicketCheck size={15} />;
  if (kind.includes('comment') || kind.includes('coment')) return <MessageCircle size={15} />;
  return <Activity size={15} />;
}

function AccountView({ user }: { user: User }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [preference, setPreference] = useState<'curto' | 'detalhado'>('curto');
  const [ticketIds, setTicketIds] = useState<number[]>([]);
  const [loadingMemory, setLoadingMemory] = useState(true);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState('');
  const [memoryNotice, setMemoryNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ preferences: { style: 'curto' | 'detalhado' }; recentTicketIds: number[] }>('/memory')
      .then(({ preferences, recentTicketIds }) => { setPreference(preferences.style); setTicketIds(recentTicketIds); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar sua memória.'))
      .finally(() => setLoadingMemory(false));
  }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setPasswordBusy(true); setError(''); setPasswordNotice('');
    try {
      await api('/auth/password', json({ currentPassword, newPassword }));
      setCurrentPassword(''); setNewPassword(''); setPasswordNotice('Senha alterada com sucesso.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a senha.'); }
    finally { setPasswordBusy(false); }
  }
  async function saveMemory(event: FormEvent) {
    event.preventDefault(); setMemoryBusy(true); setError(''); setMemoryNotice('');
    try {
      const result = await api<{ preferences: { style: 'curto' | 'detalhado' }; recentTicketIds: number[] }>('/memory', { method: 'PUT', body: JSON.stringify({ preferences: { style: preference } }) });
      setPreference(result.preferences.style); setTicketIds(result.recentTicketIds); setMemoryNotice('Preferência salva.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar sua preferência.'); }
    finally { setMemoryBusy(false); }
  }
  async function clearMemory() {
    setMemoryBusy(true); setError(''); setMemoryNotice('');
    try { await api('/memory', { method: 'DELETE' }); setPreference('curto'); setTicketIds([]); setMemoryNotice('Memória persistente limpa.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível limpar sua memória.'); }
    finally { setMemoryBusy(false); }
  }

  return <section className="account-page">
    <div className="page-heading"><div><p className="eyebrow">Preferências e segurança</p><h1>Minha conta</h1><p>Gerencie seu acesso e as informações que ajudam nas próximas conversas.</p></div></div>
    {error && <InlineNotice tone="error" action={<button type="button" className="notice-dismiss" aria-label="Fechar aviso" onClick={() => setError('')}><X size={15} /></button>}>{error}</InlineNotice>}
    <div className="account-grid">
      <section className="settings-panel identity-panel"><div className="panel-title"><span className="panel-icon"><UserRound size={18} /></span><div><h2>Seu perfil</h2><p>Identidade usada para controlar os acessos.</p></div></div>
        <div className="identity-summary"><span className="profile-avatar">{initials(user.name)}</span><div><h3>{user.name}</h3><p>{user.email}</p></div></div>
        <dl className="identity-facts"><div><dt>Função</dt><dd>{roleNames[user.role]}</dd></div><div><dt>Identificação</dt><dd>{user.id}</dd></div></dl>
        <div className="permission-explainer"><ShieldCheck size={17} /><p>Você consulta tickets dos quais participou ou que foram compartilhados com seu usuário.</p></div>
      </section>

      <section className="settings-panel"><div className="panel-title"><span className="panel-icon"><KeyRound size={18} /></span><div><h2>Alterar senha</h2><p>Use uma senha nova para esta conta local.</p></div></div>
        {passwordNotice && <InlineNotice tone="success">{passwordNotice}</InlineNotice>}
        <form className="form-stack" onSubmit={changePassword}>
          <Field label="Senha atual" htmlFor="current-password"><input id="current-password" autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></Field>
          <Field label="Nova senha" htmlFor="new-password" hint="Mínimo de 12 caracteres"><input id="new-password" autoComplete="new-password" type="password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></Field>
          <div className="form-actions"><button className="button button-primary" type="submit" disabled={passwordBusy}>{passwordBusy ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />} Salvar nova senha</button></div>
        </form>
      </section>

      <section className="settings-panel memory-panel"><div className="panel-title"><span className="panel-icon"><Sparkles size={18} /></span><div><h2>Memória do assistente</h2><p>Preferências e referências que podem ajudar em outra conversa.</p></div></div>
        {loadingMemory ? <div className="loading-row"><LoaderCircle className="spin" size={17} />Carregando memória…</div> : <>
          {memoryNotice && <InlineNotice tone="success">{memoryNotice}</InlineNotice>}
          <form className="form-stack" onSubmit={saveMemory}>
            <fieldset className="preference-fieldset"><legend>Estilo das respostas</legend>
              <label className={`preference-option ${preference === 'curto' ? 'is-chosen' : ''}`}><input type="radio" name="style" value="curto" checked={preference === 'curto'} onChange={() => setPreference('curto')} /><span className="radio-indicator" /><span><b>Diretas</b><small>Respostas concisas, com os pontos essenciais.</small></span></label>
              <label className={`preference-option ${preference === 'detalhado' ? 'is-chosen' : ''}`}><input type="radio" name="style" value="detalhado" checked={preference === 'detalhado'} onChange={() => setPreference('detalhado')} /><span className="radio-indicator" /><span><b>Detalhadas</b><small>Mais contexto e passos explicados.</small></span></label>
            </fieldset>
            <div className="recent-ids"><div><b>Tickets recentes lembrados</b><small>Os fatos são sempre consultados novamente antes da resposta.</small></div><div className="ticket-id-chips">{ticketIds.length ? ticketIds.map((id) => <span key={id}>#{id}</span>) : <span className="no-memory">Nenhuma referência recente</span>}</div></div>
            <div className="memory-actions"><button className="button button-primary" type="submit" disabled={memoryBusy}>{memoryBusy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />} Salvar preferência</button><button className="button button-quiet danger-quiet" type="button" disabled={memoryBusy || (preference === 'curto' && ticketIds.length === 0)} onClick={clearMemory}><Trash2 size={15} /> Limpar memória</button></div>
          </form>
        </>}
      </section>
    </div>
  </section>;
}

function AccessView() {
  const [users, setUsers] = useState<User[]>([]);
  const [ticketId, setTicketId] = useState('');
  const [userId, setUserId] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api<{ users: User[] }>('/admin/users').then(({ users: items }) => { setUsers(items); setUserId(items[0]?.id ?? ''); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os usuários.'))
      .finally(() => setLoadingUsers(false));
  }, []);

  async function lookup(event: FormEvent) {
    event.preventDefault(); const id = Number(lookupId); if (!Number.isSafeInteger(id) || id < 1) return;
    setLoadingGrants(true); setError(''); setNotice('');
    try { const { grants: items } = await api<{ grants: Grant[] }>(`/admin/grants/${id}`); setGrants(items.map((grant) => ({ ...grant, ticketId: id })).filter((grant) => grant.active !== false)); setTicketId(String(id)); setLookupId(String(id)); }
    catch (cause) { setGrants([]); setError(cause instanceof Error ? cause.message : 'Não foi possível consultar os acessos deste ticket.'); }
    finally { setLoadingGrants(false); }
  }

  async function grantAccess(event: FormEvent) {
    event.preventDefault(); const id = Number(ticketId);
    if (!Number.isSafeInteger(id) || id < 1 || !userId) return;
    setBusy(true); setError(''); setNotice('');
    try { await api('/admin/grants', json({ ticketId: id, userId })); setNotice(`Acesso concedido a ${users.find((item) => item.id === userId)?.name ?? 'usuário'}.`); setLookupId(String(id)); const result = await api<{ grants: Grant[] }>(`/admin/grants/${id}`); setGrants(result.grants.map((grant) => ({ ...grant, ticketId: id })).filter((grant) => grant.active !== false)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível conceder o acesso.'); }
    finally { setBusy(false); }
  }

  async function revoke(grant: Grant) {
    setBusy(true); setError(''); setNotice('');
    try { await api(`/admin/grants/${grant.ticketId}/${encodeURIComponent(grant.userId)}`, { method: 'DELETE' }); setNotice('Acesso revogado.'); setGrants((items) => items.filter((item) => item.userId !== grant.userId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível revogar o acesso.'); }
    finally { setBusy(false); }
  }

  return <section className="access-page">
    <div className="page-heading"><div><p className="eyebrow">Administração de acesso</p><h1>Acessos</h1><p>Compartilhe a leitura de um ticket com um usuário específico.</p></div><span className="admin-only-badge"><ShieldCheck size={16} /> Somente administradores</span></div>
    {error && <InlineNotice tone="error" action={<button type="button" className="notice-dismiss" aria-label="Fechar aviso" onClick={() => setError('')}><X size={15} /></button>}>{error}</InlineNotice>}
    {notice && <InlineNotice tone="success" action={<button type="button" className="notice-dismiss" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15} /></button>}>{notice}</InlineNotice>}
    <div className="access-grid">
      <section className="settings-panel grant-panel"><div className="panel-title"><span className="panel-icon"><UsersRound size={18} /></span><div><h2>Conceder acesso</h2><p>O acesso permite consultar o ticket e suas fontes no assistente.</p></div></div>
        <form className="form-stack" onSubmit={grantAccess}>
          <Field label="Número do ticket" htmlFor="grant-ticket-id"><input id="grant-ticket-id" type="number" min={1} step={1} required value={ticketId} onChange={(event) => setTicketId(event.target.value)} placeholder="Ex.: 2233" /></Field>
          <Field label="Usuário" htmlFor="grant-user-id"><select id="grant-user-id" required disabled={loadingUsers || users.length === 0} value={userId} onChange={(event) => setUserId(event.target.value)}>
            {loadingUsers ? <option>Carregando usuários…</option> : users.length === 0 ? <option value="">Nenhum usuário disponível</option> : users.map((item) => <option key={item.id} value={item.id}>{item.name} · {roleNames[item.role]}</option>)}
          </select></Field>
          <div className="access-info"><ShieldCheck size={17} /><p>A concessão dá leitura ao ticket selecionado. Ela não altera a função do usuário.</p></div>
          <button className="button button-primary" type="submit" disabled={busy || loadingUsers || !ticketId || !userId}>{busy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Conceder acesso</button>
        </form>
      </section>
      <section className="settings-panel grants-panel"><div className="panel-title"><span className="panel-icon"><BadgeCheck size={18} /></span><div><h2>Acessos concedidos</h2><p>Revogue uma concessão a qualquer momento.</p></div></div>
        <form className="grant-lookup" onSubmit={lookup}><Field label="Consultar pelo número do ticket" htmlFor="grant-lookup-id"><input id="grant-lookup-id" type="number" min={1} step={1} required value={lookupId} onChange={(event) => setLookupId(event.target.value)} placeholder="Ex.: 2233" /></Field><button className="button button-secondary" type="submit" disabled={loadingGrants || !lookupId}>{loadingGrants ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} Consultar</button></form>
        {loadingGrants && <div className="loading-row"><LoaderCircle className="spin" size={17} />Consultando concessões…</div>}
        {!loadingGrants && grants.length > 0 && <div className="grants-list"><div className="grants-list-caption">Ticket #{grants[0].ticketId} · {grants.length} {grants.length === 1 ? 'acesso ativo' : 'acessos ativos'}</div>
          {grants.map((grant) => { const grantee = users.find((item) => item.id === grant.userId); return <div key={grant.userId} className="grant-row"><span className="user-avatar small-avatar">{initials(grantee?.name ?? grant.userName ?? grant.userId)}</span><span className="grant-person"><b>{grantee?.name ?? grant.userName ?? grant.userId}</b><small>{grantee?.email ?? grant.email ?? 'Usuário autorizado'}{grant.createdAt ? ` · desde ${formatDate(grant.createdAt)}` : ''}</small></span><button className="button button-small button-danger-outline" type="button" disabled={busy} onClick={() => void revoke(grant)}><X size={14} /> Revogar</button></div>; })}
        </div>}
        {!loadingGrants && lookupId && grants.length === 0 && !error && <div className="empty-grants"><UserRound size={23} /><b>Nenhuma concessão ativa</b><span>Este ticket não possui acessos compartilhados no momento.</span></div>}
        {!loadingGrants && !lookupId && <div className="empty-grants"><UsersRound size={23} /><b>Consulte um ticket</b><span>Informe o número para ver e gerenciar os acessos concedidos.</span></div>}
      </section>
    </div>
  </section>;
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstControl = dialog?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
      ?? dialog?.querySelector<HTMLElement>('button:not([disabled]), a[href]');
    (firstControl ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description" tabIndex={-1} ref={dialogRef}>
      <div className="modal-header"><div><h2 id="modal-title">{title}</h2><p id="modal-description">{description}</p></div><button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}><X size={19} /></button></div>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return <div className="field"><div className="field-label-line"><label htmlFor={htmlFor}>{label}</label>{hint && <span>{hint}</span>}</div>{children}</div>;
}
function InlineNotice({ tone, action, children }: { tone: 'error' | 'success' | 'info'; action?: ReactNode; children: ReactNode }) {
  return <div className={`inline-notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}><span className="notice-symbol">{tone === 'error' ? <CircleHelp size={16} /> : tone === 'success' ? <Check size={16} /> : <ArrowDownLeft size={16} />}</span><span className="notice-copy">{children}</span>{action}</div>;
}
function StatusBadge({ status }: { status: Status }) { return <span className={`status-badge status-${status}`}><span className="status-badge-dot" />{statusNames[status]}</span>; }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '').join(''); }
function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
}

export default App;
