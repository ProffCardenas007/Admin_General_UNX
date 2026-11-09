"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { API_URL, authHeaders, getStoredUserId } from "../../lib/api";
import { extractErrorMessage } from "../../lib/http";

type Colleague = { id: string; fullName: string; role: "manager" | "lead" | "worker" };
type ProjectOption = { id: string; code: string; name: string };
type TaskOption = { id: string; code: string; title: string; projectId: string };
type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  taskId?: string | null;
  projectId?: string | null;
  createdAt: string;
};
type Conversation = {
  id: string;
  otherUser: Colleague;
  lastMessage: Message | null;
  unreadCount: number;
  updatedAt: string;
};

const roleLabels = { manager: "Gerencia", lead: "Líder", worker: "Colaborador" };

export default function MessagingPanel() {
  const [userId, setUserId] = useState("");
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [contextError, setContextError] = useState("");
  const activeConversationRef = useRef("");

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  );
  const filteredTasks = useMemo(
    () => tasks.filter((task) => !projectId || task.projectId === projectId),
    [projectId, tasks],
  );

  const loadConversations = useCallback(async () => {
    const response = await axios.get(`${API_URL}/messaging/conversations`, {
      headers: authHeaders(),
    });
    setConversations(response.data as Conversation[]);
  }, []);

  const loadMessages = useCallback(async (conversationId: string, before?: string) => {
    const response = await axios.get(
      `${API_URL}/messaging/conversations/${conversationId}/messages`,
      { headers: authHeaders(), params: before ? { before } : undefined },
    );
    const result = response.data as { messages: Message[]; hasMore: boolean };
    if (activeConversationRef.current !== conversationId) return;
    setHasOlderMessages(result.hasMore);
    setMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]));
      result.messages.forEach((message) => byId.set(message.id, message));
      return [...byId.values()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    });
  }, []);

  useEffect(() => {
    let active = true;
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const [usersResponse] = await Promise.all([
          axios.get(`${API_URL}/messaging/users`, { headers: authHeaders() }),
          loadConversations(),
        ]);
        if (!active) return;
        setUserId(getStoredUserId());
        setColleagues(usersResponse.data as Colleague[]);
        const [projectsResult, tasksResult] = await Promise.allSettled([
          axios.get(`${API_URL}/projects`, { headers: authHeaders() }),
          axios.get(`${API_URL}/tasks`, { headers: authHeaders() }),
        ]);
        if (!active) return;
        if (projectsResult.status === "fulfilled") {
          setProjects(projectsResult.value.data as ProjectOption[]);
        }
        if (tasksResult.status === "fulfilled") {
          setTasks(tasksResult.value.data as TaskOption[]);
        }
        const requestedConversationId = new URLSearchParams(window.location.search).get("conversationId");
        if (requestedConversationId) {
          setSelectedConversationId(requestedConversationId);
        }
        setContextError(
          projectsResult.status === "rejected" || tasksResult.status === "rejected"
            ? "La mensajería funciona, pero no se pudieron cargar las opciones de contexto."
            : "",
        );
      } catch (caughtError) {
        if (active) {
          setError(extractErrorMessage(caughtError, "No se pudo cargar la mensajería."));
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadInitialData();
    return () => {
      active = false;
    };
  }, [loadConversations]);

  useEffect(() => {
    const handleOpenConversation = (event: Event) => {
      const conversationId = (event as CustomEvent<string>).detail;
      if (!conversationId) return;
      activeConversationRef.current = conversationId;
      setMessages([]);
      setHasOlderMessages(false);
      setLoadingMessages(true);
      setSelectedConversationId(conversationId);
    };
    window.addEventListener("open-message-conversation", handleOpenConversation);
    return () =>
      window.removeEventListener("open-message-conversation", handleOpenConversation);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void loadConversations().catch((caughtError) => {
        setError(extractErrorMessage(caughtError, "No se pudieron actualizar las conversaciones."));
      });
    }, 20000);
    return () => window.clearInterval(intervalId);
  }, [loadConversations]);

  useEffect(() => {
    activeConversationRef.current = selectedConversationId;
    if (!selectedConversationId) {
      return;
    }

    let active = true;
    let hasLoadedMessages = false;
    const refresh = async () => {
      if (!hasLoadedMessages) setLoadingMessages(true);
      try {
        await loadMessages(selectedConversationId);
        await loadConversations();
        if (active) setError("");
      } catch (caughtError) {
        if (active) {
          setError(extractErrorMessage(caughtError, "No se pudo cargar la conversación."));
        }
      } finally {
        hasLoadedMessages = true;
        if (active) setLoadingMessages(false);
      }
    };
    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 10000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [loadConversations, loadMessages, selectedConversationId]);

  const openConversation = async (targetUserId: string) => {
    if (!targetUserId) return;
    try {
      const response = await axios.post(
        `${API_URL}/messaging/conversations`,
        { recipientId: targetUserId },
        { headers: authHeaders() },
      );
      const conversation = response.data as { id: string };
      setRecipientId("");
      activeConversationRef.current = conversation.id;
      setMessages([]);
      setHasOlderMessages(false);
      setLoadingMessages(true);
      setSelectedConversationId(conversation.id);
      await loadConversations();
      setError("");
    } catch (caughtError) {
      setError(extractErrorMessage(caughtError, "No se pudo abrir la conversación."));
    }
  };

  const selectConversation = (conversationId: string) => {
    activeConversationRef.current = conversationId;
    setMessages([]);
    setHasOlderMessages(false);
    setLoadingMessages(true);
    setSelectedConversationId(conversationId);
  };

  const loadOlderMessages = async () => {
    if (!selectedConversationId || messages.length === 0) return;
    try {
      await loadMessages(selectedConversationId, messages[0].id);
    } catch (caughtError) {
      setError(extractErrorMessage(caughtError, "No se pudieron cargar mensajes anteriores."));
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!selectedConversationId || !trimmed || sending) return;

    setSending(true);
    try {
      await axios.post(
        `${API_URL}/messaging/conversations/${selectedConversationId}/messages`,
        {
          content: trimmed,
          projectId: projectId || undefined,
          taskId: taskId || undefined,
        },
        { headers: authHeaders() },
      );
      setContent("");
      setTaskId("");
      await Promise.all([loadMessages(selectedConversationId), loadConversations()]);
      setError("");
    } catch (caughtError) {
      setError(extractErrorMessage(caughtError, "No se pudo enviar el mensaje."));
    } finally {
      setSending(false);
    }
  };

  const contextLabel = (message: Message) => {
    const task = tasks.find((item) => item.id === message.taskId);
    const project = projects.find((item) => item.id === message.projectId);
    if (task) return `Tarea ${task.code} · ${task.title}`;
    if (project) return `Proyecto ${project.code} · ${project.name}`;
    return "";
  };

  return (
    <section className="kpi-card fade-up p-5" aria-label="Mensajería de trabajo">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Mensajería de trabajo</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Mensajes directos entre todas las personas activas. El historial queda registrado.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={recipientId}
            onChange={(event) => setRecipientId(event.target.value)}
            className="ui-control min-w-52"
            aria-label="Seleccionar persona para conversar"
          >
            <option value="">Nueva conversación...</option>
            {colleagues.map((colleague) => (
              <option key={colleague.id} value={colleague.id}>
                {colleague.fullName} · {roleLabels[colleague.role]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!recipientId}
            onClick={() => void openConversation(recipientId)}
            className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            Abrir
          </button>
        </div>
      </div>

      {error || contextError ? (
        <p role="alert" className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error || contextError}
        </p>
      ) : null}

      <div className="mt-5 grid min-h-[440px] overflow-hidden rounded-2xl border border-[var(--line)] md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-[var(--line)] bg-[var(--background)] md:border-b-0 md:border-r">
          <h3 className="px-4 py-3 text-sm font-semibold">Conversaciones</h3>
          {loading ? (
            <p className="px-4 py-3 text-sm text-[var(--ink-muted)]">Cargando...</p>
          ) : conversations.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--ink-muted)]">Aún no tienes conversaciones.</p>
          ) : (
            <div className="max-h-[440px] overflow-y-auto">
              {conversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  onClick={() => selectConversation(conversation.id)}
                  className={`w-full border-t border-[var(--line)] px-4 py-3 text-left hover:bg-white ${
                    selectedConversationId === conversation.id ? "bg-white" : ""
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{conversation.otherUser.fullName}</span>
                    {conversation.unreadCount > 0 ? (
                      <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block truncate text-xs text-[var(--ink-muted)]">
                    {conversation.lastMessage?.content ?? "Sin mensajes todavía"}
                  </span>
                  <span className="mt-1 block text-[11px] text-[var(--ink-muted)]">
                    {conversation.lastMessage
                      ? new Date(conversation.lastMessage.createdAt).toLocaleString()
                      : roleLabels[conversation.otherUser.role]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="flex min-h-[440px] min-w-0 flex-col">
          {selectedConversation ? (
            <>
              <header className="border-b border-[var(--line)] px-4 py-3">
                <p className="font-semibold">{selectedConversation.otherUser.fullName}</p>
                <p className="text-xs text-[var(--ink-muted)]">{roleLabels[selectedConversation.otherUser.role]}</p>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--background)] p-4">
                {hasOlderMessages ? (
                  <button
                    type="button"
                    onClick={() => void loadOlderMessages()}
                    className="ui-btn ui-btn-secondary ui-btn-sm mx-auto block"
                  >
                    Cargar mensajes anteriores
                  </button>
                ) : null}
                {loadingMessages && messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--ink-muted)]">Cargando mensajes...</p>
                ) : messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--ink-muted)]">
                    Inicia la conversación con un mensaje de trabajo.
                  </p>
                ) : (
                  messages.map((message) => {
                    const ownMessage = message.senderId === userId;
                    const context = contextLabel(message);
                    return (
                      <article
                        key={message.id}
                        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                          ownMessage ? "ml-auto bg-[var(--accent)] text-white" : "bg-white"
                        }`}
                      >
                        {context ? (
                          <p className={`mb-2 text-xs ${ownMessage ? "text-white/80" : "text-[var(--ink-muted)]"}`}>
                            {context}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
                        <time className={`mt-2 block text-right text-[11px] ${ownMessage ? "text-white/75" : "text-[var(--ink-muted)]"}`}>
                          {new Date(message.createdAt).toLocaleString()}
                        </time>
                      </article>
                    );
                  })
                )}
              </div>
              <form onSubmit={sendMessage} className="space-y-2 border-t border-[var(--line)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={projectId}
                    onChange={(event) => {
                      setProjectId(event.target.value);
                      setTaskId("");
                    }}
                    className="ui-control flex-1"
                    aria-label="Vincular proyecto (opcional)"
                  >
                    <option value="">Sin proyecto vinculado</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.code} · {project.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={taskId}
                    onChange={(event) => setTaskId(event.target.value)}
                    className="ui-control flex-1"
                    aria-label="Vincular tarea (opcional)"
                  >
                    <option value="">Sin tarea vinculada</option>
                    {filteredTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.code} · {task.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    maxLength={5000}
                    rows={2}
                    placeholder="Escribe un mensaje de trabajo..."
                    aria-label="Mensaje"
                    className="ui-control min-h-12 flex-1 resize-y"
                  />
                  <button
                    type="submit"
                    disabled={sending || !content.trim()}
                    className="ui-btn ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sending ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-[var(--ink-muted)]">
              Selecciona una conversación o inicia una nueva.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
