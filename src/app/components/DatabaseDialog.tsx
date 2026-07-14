import { Check, Clipboard, Database, Download, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DiagramModel } from "../../model/types";
import { introspectDatabase } from "../../database/introspection";
import { compareDiagramToDatabase, generateMigrationSql, type SchemaDiffItem } from "../../database/schemaDiff";
import { introspectedSchemaToDbml } from "../../database/schemaToDbml";
import type { DatabaseConnectionConfig, DatabaseDialect, IntrospectedDatabaseSchema } from "../../database/types";
import { downloadText } from "../../utils/download";

export function DatabaseDialog({ mode, diagram, onCreateProject, onClose }: {
  mode: "create" | "sync";
  diagram?: DiagramModel;
  onCreateProject?(name: string, dbml: string): Promise<void> | void;
  onClose(): void;
}) {
  const [dialect, setDialect] = useState<DatabaseDialect>("postgres");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(false);
  const [sqlitePath, setSqlitePath] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState<IntrospectedDatabaseSchema>();
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const diff = useMemo(() => schema && diagram ? compareDiagramToDatabase(diagram, schema) : [], [diagram, schema]);
  const migration = useMemo(() => schema && diagram ? generateMigrationSql(diagram, schema) : "", [diagram, schema]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const changeDialect = (value: DatabaseDialect) => {
    setDialect(value);
    setPort(value === "postgres" ? 5432 : value === "mysql" ? 3306 : 0);
    setSchema(undefined);
    setError("");
  };

  const connect = async () => {
    setWorking(true);
    setError("");
    try {
      const config: DatabaseConnectionConfig = dialect === "sqlite"
        ? { dialect, path: sqlitePath }
        : { dialect, host, port, database, user, password, ssl };
      const nextSchema = await introspectDatabase(config);
      setSchema(nextSchema);
      setPassword("");
      if (mode === "create") {
        await onCreateProject?.(nextSchema.database || "Banco importado", introspectedSchemaToDbml(nextSchema));
        toast.success(`${nextSchema.tables.length} tabelas importadas do banco`);
        onClose();
      } else toast.success("Comparação concluída");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível conectar ao banco.");
    } finally {
      setWorking(false);
    }
  };

  const copyMigration = async () => {
    await navigator.clipboard.writeText(migration);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="modal-panel database-dialog" role="dialog" aria-modal="true" aria-labelledby="database-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="modal-heading"><div><h2 id="database-dialog-title">{mode === "create" ? "Importar de banco real" : "Comparar banco × projeto"}</h2><small>Consultas somente nos catálogos de metadados.</small></div><button ref={closeRef} type="button" className="icon-button" aria-label="Fechar conexão" onClick={onClose}><X size={16} /></button></div>
      <div className="database-dialog-body">
        <div className="database-safety-note"><ShieldCheck size={17} /><div><strong>Conexão read-only</strong><span>A senha é usada apenas nesta requisição e nunca é salva pelo DBML Studio.</span></div></div>
        {!schema && <div className="database-form">
          <label><span>Banco</span><select value={dialect} onChange={(event) => changeDialect(event.target.value as DatabaseDialect)}><option value="postgres">PostgreSQL</option><option value="mysql">MySQL</option><option value="sqlite">SQLite</option></select></label>
          {dialect === "sqlite" ? <label className="database-form-wide"><span>Caminho no servidor</span><input value={sqlitePath} onChange={(event) => setSqlitePath(event.target.value)} placeholder="meu-projeto/database.sqlite" autoFocus /></label> : <>
            <label><span>Host</span><input value={host} onChange={(event) => setHost(event.target.value)} autoFocus /></label>
            <label><span>Porta</span><input type="number" value={port} onChange={(event) => setPort(Number(event.target.value))} /></label>
            <label><span>Database</span><input value={database} onChange={(event) => setDatabase(event.target.value)} /></label>
            <label><span>Usuário</span><input value={user} onChange={(event) => setUser(event.target.value)} /></label>
            <label><span>Senha</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <label className="database-checkbox"><span>SSL</span><input type="checkbox" checked={ssl} onChange={(event) => setSsl(event.target.checked)} /></label>
          </>}
        </div>}
        {error && <div className="modal-error" role="alert">{error}</div>}
        {schema && mode === "sync" && <DatabaseDiffResult schema={schema} diff={diff} migration={migration} copied={copied} onCopy={() => void copyMigration()} onDownload={() => downloadText(`${schema.database || "database"}-migration.sql`, migration)} onReconnect={() => setSchema(undefined)} />}
      </div>
      {!schema && <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="button" disabled={working || (dialect === "sqlite" ? !sqlitePath.trim() : !host.trim() || !database.trim() || !user.trim())} onClick={() => void connect()}>{working ? <LoaderCircle size={15} className="is-spinning" /> : <Database size={15} />}{working ? "Consultando…" : mode === "create" ? "Importar schema" : "Comparar"}</button></div>}
    </section>
  </div>;
}

function DatabaseDiffResult({ schema, diff, migration, copied, onCopy, onDownload, onReconnect }: { schema: IntrospectedDatabaseSchema; diff: SchemaDiffItem[]; migration: string; copied: boolean; onCopy(): void; onDownload(): void; onReconnect(): void }) {
  const destructive = diff.filter((item) => item.destructive).length;
  return <div className="database-diff-result">
    <div className="database-diff-summary"><div><strong>{schema.tables.length}</strong><span>tabelas no banco</span></div><div><strong>{diff.length}</strong><span>diferenças</span></div><div><strong>{destructive}</strong><span>pedem revisão</span></div></div>
    <div className="database-diff-list">{diff.map((item, index) => <article key={`${item.kind}-${item.table}-${item.column ?? ""}-${index}`} className={item.destructive ? "is-destructive" : ""}><span>{item.kind}</span><p>{item.message}</p></article>)}{!diff.length && <div className="database-in-sync"><Check size={18} /><strong>Projeto e banco estão alinhados</strong></div>}</div>
    <div className="database-migration-heading"><div><strong>Migration sugerida</strong><span>Operações destrutivas permanecem comentadas.</span></div><button type="button" className="secondary-button" onClick={onCopy}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? "Copiado" : "Copiar"}</button><button type="button" className="secondary-button" onClick={onDownload}><Download size={14} />SQL</button></div>
    <textarea readOnly value={migration} aria-label="Migration SQL sugerida" />
    <button type="button" className="secondary-button database-reconnect" onClick={onReconnect}>Comparar outra conexão</button>
  </div>;
}
