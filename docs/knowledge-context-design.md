# ナレッジコンテキスト 詳細設計ドキュメント

> 本ドキュメントは `care-manager-ai-design.md` の「10.3 ナレッジコンテキストの設計」を詳細化したもの。
> pgvector を使った RAG(Retrieval-Augmented Generation)機能の中核を定義する。

**ドキュメントバージョン**: 0.3 (実装前レビュー反映版)
**最終更新**: 2026-04-23
**親ドキュメント**: `care-manager-ai-design.md`
**関連ドキュメント**: `pii-masking-design.md`, `assessment-aggregate-design.md`

---

## 1. 背景と方針

### 1.1 親ドキュメント・要件定義書での位置づけ

ナレッジベース機能は要件定義書のMVP機能 4.4 に該当:

- **個人ナレッジ**: 各ケアマネがメモ・ノウハウを登録・管理
- **共有ナレッジ**: 管理者が制度資料・マニュアルを登録、事業所全員参照
- **対応ファイル**: PDF、Word、テキスト
- **検索方式**: pgvector による埋め込み検索
- **使用シーン**: ケアプランドラフト生成時の参照(MVP)

### 1.2 確定した設計判断(意思決定の記録)

| 項目 | 採用方針 | 決定理由 |
|------|---------|---------|
| 埋め込みモデル | **Gemini text-embedding-004**(768次元) | AI プロバイダ統一(Gemini)と整合、API キー管理が一本化 |
| RAG 参照シーン | **ケアプランドラフト生成時のみ**(MVP) | 要件定義書明記の中核ユースケース。アセスメント生成時は将来検討 |
| アクセス制御 | **個人ナレッジ=本人のみ、共有ナレッジ=テナント内全員** | 要件定義書通り |
| 集約境界 | **集約 + Read Model パターン**(候補3) | 書き込みと検索を関心分離。チャンクは独立ライフサイクルなしのため候補2は不採用 |
| アップロードファイル | **KnowledgeDocument 集約に含める** | 業務的に「元ファイルは何か」が意味を持つ。1:1の関係 |
| 処理状態UX | **ready のみ検索対象、他は非表示** | MVPシンプル。進捗UI・状態管理を持ち込まない |
| チャンク分割 | **固定800文字 + 100文字オーバーラップ** | 介護資料は段落構造が不安定、固定文字数が現実解 |
| インデックス | **HNSW**(IVFFlat より速度・精度優先) | ナレッジは継続追加されるため再構築不要のHNSWが適 |

### 1.3 採用しなかった選択肢の記録

| 選択肢 | 採用しなかった理由 |
|--------|------------------|
| OpenAI text-embedding-3-small | 別途 OpenAI API キー管理が必要、運用が二重化する |
| 多言語特化モデル(multilingual-e5等)のセルフホスト | 別途推論サーバーが必要で MVP には過剰 |
| アセスメント生成時の RAG 参照 | AI 呼び出しが2段階になり複雑化、MVPスコープ外 |
| 手動ナレッジ検索画面 | 要件定義書に明記なし、MVP では不要 |
| 単一集約でドキュメント+チャンクを完結 | 検索性能と集約整合性の関心が混ざる |
| チャンクを独立集約に | チャンクは独立した業務的意味を持たない、過剰設計 |
| 段落・見出しベースのチャンク分割 | PDF構造取得が不安定、フォーマット依存 |
| LLM による意味的分割 | コスト・レイテンシ大、MVP過剰 |
| アップロード同期処理 | Vercelのタイムアウト制約、UXも悪い |
| IVFFlat インデックス | 追加更新時の再構築リスク、HNSW で十分 |

---

## 2. ドメインモデル設計

### 2.1 集約境界 — 集約 + Read Model パターン

```
【書き込み側 (Write Model)】
┌────────────────────────────────────┐
│ 【集約】ナレッジドキュメント            │
│  Root: KnowledgeDocument           │
│  ├ メタ情報(タイトル・スコープ・所有者) │
│  ├ 元ファイル参照(URL/パス/種類)     │
│  ├ 処理ステータス                    │
│  └ チャンク[] (KnowledgeChunk)      │
│       ├ シーケンス番号               │
│       ├ テキスト                    │
│       ├ 埋め込みベクトル(768次元)     │
│       └ ページ番号(PDF時)           │
└────────────────────────────────────┘

【読み込み側 (Read Model)】
┌────────────────────────────────────┐
│ KnowledgeSearchView                │
│ - 検索結果用の専用構造               │
│ - リポジトリではなくサービス経由で取得 │
└────────────────────────────────────┘
```

### 2.2 集約境界の選択理由

| 採用理由 | 詳細 |
|---------|------|
| チャンクは独立した業務的意味を持たない | ドキュメント分割の機械処理結果、単独更新シナリオなし |
| 検索は集約取得とは性質が違う | ベクトル類似度で横断的取得 → リポジトリではなくサービス |
| MVP で破綻しない | チャンク数が増えても Read Model 側の関心事 |
| CQRS の本質は単純 | 「保存用」と「検索用」の道具を別々に持つだけ |

### 2.3 ディレクトリ構造

```
domain/knowledge/
├── document/
│   ├── KnowledgeDocument.ts         (集約ルート)
│   ├── KnowledgeDocumentId.ts
│   ├── KnowledgeChunk.ts            (子エンティティ、集約内)
│   ├── KnowledgeChunkId.ts
│   ├── KnowledgeScope.ts            (値オブジェクト: 個人/共有)
│   ├── ProcessingStatus.ts          (値オブジェクト: 状態)
│   ├── EmbeddingVector.ts           (値オブジェクト)
│   ├── SourceFile.ts                (値オブジェクト: ファイル参照)
│   └── IKnowledgeDocumentRepository.ts
└── search/
    ├── KnowledgeSearchView.ts       (Read Model)
    ├── SearchQuery.ts               (値オブジェクト)
    └── IKnowledgeSearchService.ts   (検索専用ドメインサービス)
```

### 2.4 主要型の概要

```typescript
// KnowledgeDocument (集約ルート) の概要
class KnowledgeDocument {
  id: KnowledgeDocumentId
  tenantId: TenantId
  scope: KnowledgeScope             // 'personal' | 'shared'
  ownerId: UserId | null            // personal の場合は必須、shared の場合は null
  title: string
  sourceFile: SourceFile            // URL/パス/種類/サイズ
  chunks: KnowledgeChunk[]          // 集約内の子エンティティ
  processingStatus: ProcessingStatus
  uploadedBy: UserId
  uploadedAt: Date
  readyAt: Date | null
  version: number
}

// KnowledgeChunk (子エンティティ) の概要
class KnowledgeChunk {
  id: KnowledgeChunkId
  sequenceNo: number                // ドキュメント内の順序
  text: string                      // チャンクテキスト
  embedding: EmbeddingVector        // 768次元
  pageNumber: number | null         // PDF の場合のページ番号
}

// KnowledgeSearchView (Read Model) の概要
class KnowledgeSearchView {
  documentId: string
  documentTitle: string
  chunkText: string
  chunkPageNumber: number | null
  similarity: number                // 類似度スコア(0-1)
  scope: KnowledgeScope
}

// IKnowledgeSearchService (検索ドメインサービス) の概要
interface IKnowledgeSearchService {
  searchByText(params: {
    queryText: string
    tenantId: TenantId
    requesterId: UserId             // アクセス制御用
    topK: number                    // 上位N件
    minSimilarity?: number          // 類似度閾値
  }): Promise<KnowledgeSearchView[]>
}
```

### 2.5 集約ルート詳細実装(KnowledgeDocument)

```typescript
// domain/knowledge/document/KnowledgeDocument.ts
// ※ フレームワーク非依存、純粋な TypeScript

export class KnowledgeDocument {
  private constructor(
    private readonly _id: KnowledgeDocumentId,
    private readonly _tenantId: TenantId,
    private readonly _scope: KnowledgeScope,
    private readonly _ownerId: UserId | null,
    private _title: string,
    private readonly _sourceFile: SourceFile,
    private _chunks: KnowledgeChunk[],
    private _processingStatus: ProcessingStatus,
    private _processingError: string | null,
    private readonly _uploadedBy: UserId,
    private readonly _uploadedAt: Date,
    private _readyAt: Date | null,
    private _version: number,
  ) {}

  // ───── ファクトリメソッド ─────

  /** 新規ドキュメントアップロード時(pending 状態、チャンクなし) */
  static create(params: {
    tenantId: TenantId;
    scope: KnowledgeScope;
    ownerId: UserId | null;
    title: string;
    sourceFile: SourceFile;
    uploadedBy: UserId;
  }): KnowledgeDocument {
    if (params.title.trim().length === 0) {
      throw new KnowledgeValidationError('タイトルは空にできません');
    }
    if (params.scope === 'personal' && params.ownerId === null) {
      throw new KnowledgeValidationError('個人ナレッジには所有者が必須です');
    }
    if (params.scope === 'shared' && params.ownerId !== null) {
      throw new KnowledgeValidationError('共有ナレッジに所有者を設定してはいけません');
    }
    return new KnowledgeDocument(
      KnowledgeDocumentId.generate(),
      params.tenantId,
      params.scope,
      params.ownerId,
      params.title,
      params.sourceFile,
      [],                                     // pending 時点ではチャンクなし
      'pending',
      null,
      params.uploadedBy,
      new Date(),
      null,
      1,
    );
  }

  /** リポジトリから復元 */
  static reconstruct(params: { /* 全フィールド */ }): KnowledgeDocument {
    return new KnowledgeDocument(/* ... */);
  }

  // ───── 状態遷移メソッド ─────

  // 楽観的ロック方針(M8): ドメインは version を変更しない。
  // 保存時にリポジトリ/RPC が「受け取った version を current_db_version と比較 →
  // 一致すれば UPDATE SET version = version + 1」の流れで加算する(care-plan/assessment と統一)。

  /** バックグラウンドジョブが処理を開始したときに呼ぶ */
  markAsProcessing(): void {
    if (this._processingStatus !== 'pending') {
      throw new IllegalStateTransitionError(
        `pending 状態のみ processing に遷移できます。現在: ${this._processingStatus}`,
      );
    }
    this._processingStatus = 'processing';
  }

  /** チャンク生成完了時に呼ぶ(原子的にチャンク登録 + ready 化) */
  markAsReady(chunks: KnowledgeChunk[]): void {
    if (this._processingStatus !== 'processing') {
      throw new IllegalStateTransitionError(
        `processing 状態のみ ready に遷移できます。現在: ${this._processingStatus}`,
      );
    }
    if (chunks.length === 0) {
      throw new KnowledgeValidationError('ready に遷移するにはチャンクが最低1件必要です');
    }
    // sequence_no の重複チェック
    const seqs = chunks.map(c => c.sequenceNo);
    if (new Set(seqs).size !== seqs.length) {
      throw new KnowledgeValidationError('チャンクの sequence_no が重複しています');
    }
    this._chunks = chunks;
    this._processingStatus = 'ready';
    this._readyAt = new Date();
  }

  /** 処理失敗時(テキスト抽出失敗・Gemini Embedding 失敗など) */
  markAsFailed(reason: string): void {
    if (this._processingStatus !== 'pending' && this._processingStatus !== 'processing') {
      throw new IllegalStateTransitionError(
        `pending / processing 状態のみ failed に遷移できます。現在: ${this._processingStatus}`,
      );
    }
    this._processingStatus = 'failed';
    this._processingError = reason;
  }

  /** タイトル更新(ready 状態でも可能) */
  rename(newTitle: string): void {
    if (newTitle.trim().length === 0) {
      throw new KnowledgeValidationError('タイトルは空にできません');
    }
    this._title = newTitle;
  }

  // ───── ゲッター ─────
  get id(): KnowledgeDocumentId { return this._id; }
  get tenantId(): TenantId { return this._tenantId; }
  get scope(): KnowledgeScope { return this._scope; }
  get ownerId(): UserId | null { return this._ownerId; }
  get title(): string { return this._title; }
  get sourceFile(): SourceFile { return this._sourceFile; }
  get chunks(): ReadonlyArray<KnowledgeChunk> { return this._chunks; }
  get processingStatus(): ProcessingStatus { return this._processingStatus; }
  get processingError(): string | null { return this._processingError; }
  get uploadedBy(): UserId { return this._uploadedBy; }
  get uploadedAt(): Date { return this._uploadedAt; }
  get readyAt(): Date | null { return this._readyAt; }
  get version(): number { return this._version; }

  /** アクセス権限チェック(ドメインロジック) */
  canBeAccessedBy(requesterId: UserId, requesterTenantId: TenantId): boolean {
    if (!this._tenantId.equals(requesterTenantId)) return false;
    if (this._scope === 'shared') return true;
    return this._ownerId !== null && this._ownerId.equals(requesterId);
  }
}
```

### 2.6 子エンティティ詳細(KnowledgeChunk)

```typescript
// domain/knowledge/document/KnowledgeChunk.ts

export class KnowledgeChunk {
  private constructor(
    public readonly id: KnowledgeChunkId,
    public readonly sequenceNo: number,
    public readonly text: string,
    public readonly embedding: EmbeddingVector,
    public readonly pageNumber: number | null,
  ) {}

  static create(params: {
    sequenceNo: number;
    text: string;
    embedding: EmbeddingVector;
    pageNumber: number | null;
  }): KnowledgeChunk {
    if (params.text.trim().length === 0) {
      throw new KnowledgeValidationError('チャンクテキストは空にできません');
    }
    if (params.sequenceNo < 0) {
      throw new KnowledgeValidationError('sequence_no は 0 以上の整数である必要があります');
    }
    return new KnowledgeChunk(
      KnowledgeChunkId.generate(),
      params.sequenceNo,
      params.text,
      params.embedding,
      params.pageNumber,
    );
  }

  static reconstruct(params: {
    id: KnowledgeChunkId;
    sequenceNo: number;
    text: string;
    embedding: EmbeddingVector;
    pageNumber: number | null;
  }): KnowledgeChunk {
    return new KnowledgeChunk(
      params.id,
      params.sequenceNo,
      params.text,
      params.embedding,
      params.pageNumber,
    );
  }
}
```

### 2.7 値オブジェクト: EmbeddingVector / SourceFile

```typescript
// domain/knowledge/document/EmbeddingVector.ts
export class EmbeddingVector {
  private constructor(public readonly values: ReadonlyArray<number>) {}

  static create(values: number[]): EmbeddingVector {
    if (values.length !== 768) {
      throw new KnowledgeValidationError(
        `埋め込みベクトルは 768 次元である必要があります。実際: ${values.length}`,
      );
    }
    return new EmbeddingVector(values);
  }

  toArray(): number[] { return [...this.values]; }
}

// domain/knowledge/document/SourceFile.ts
export class SourceFile {
  private constructor(
    public readonly url: string,       // Supabase Storage の signed URL
    public readonly storagePath: string, // Storage 削除用のパス
    public readonly type: SourceFileType,
    public readonly sizeBytes: number,
  ) {}

  static create(params: {
    url: string;
    storagePath: string;
    type: SourceFileType;
    sizeBytes: number;
  }): SourceFile {
    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (params.sizeBytes > MAX_SIZE) {
      throw new KnowledgeValidationError(
        `ファイルサイズ上限(20MB)を超えています: ${params.sizeBytes} bytes`,
      );
    }
    if (!['pdf', 'docx', 'txt'].includes(params.type)) {
      throw new KnowledgeValidationError(`サポートされていないファイル種別: ${params.type}`);
    }
    return new SourceFile(params.url, params.storagePath, params.type, params.sizeBytes);
  }
}
```

### 2.8 不変条件まとめ

| # | 不変条件 | 守る場所 |
|---|---------|---------|
| 1 | `scope='personal'` なら `ownerId` は非 null | ドメイン(create) + DB(CHECK) |
| 2 | `scope='shared'` なら `ownerId` は null | ドメイン(create) + DB(CHECK) |
| 3 | `processing_status='ready'` の場合、チャンクが最低1件 | ドメイン(markAsReady) |
| 4 | `processing_status` 遷移は pending → processing → ready / failed のみ | ドメイン(各状態遷移メソッド) |
| 5 | `tenantId` は変更不可 | ドメイン(`readonly`) |
| 6 | チャンクの `sequence_no` は集約内で一意 | ドメイン(markAsReady) + DB(UNIQUE) |
| 7 | 埋め込みベクトルは 768 次元 | ドメイン(EmbeddingVector.create) + DB(VECTOR(768)) |

### 2.9 設計判断のポイント

| ポイント | 理由 |
|---------|------|
| `private constructor` + ファクトリメソッド | 不変条件を満たさないインスタンスを作れない |
| `create` と `reconstruct` の使い分け | 新規生成(バリデーションあり)と DB 復元(バリデーションなし)を明確化 |
| 状態遷移メソッドで原子的にチャンク登録 + ready 化 | 「チャンクがあるのに pending」などの中間状態を許さない |
| `canBeAccessedBy` をドメインに置く | アクセス制御ロジックをドメインに寄せることで、RLS・ユースケース層と二重チェック可能に |
| ゲッターで `ReadonlyArray` を返す | 外部からの破壊的変更を型レベルで防ぐ |
| チャンクは不変(更新メソッドなし) | チャンクは機械処理の結果。編集要件が出たら再アップロード運用 |
| `version` 加算はドメインでは行わず、RPC/リポジトリで実施 | ケアプラン・アセスメントと方針を統一(M8)。ドメインは「受け取った version = 現在の version」という楽観的ロックの期待値のみ保持し、永続化時に RPC が検証して +1 する |

### 2.10 列挙型

```typescript
export type KnowledgeScope = 'personal' | 'shared';

export type ProcessingStatus =
  | 'pending'      // アップロード直後、処理待ち
  | 'processing'   // 埋め込み生成中
  | 'ready'        // 検索可能
  | 'failed';      // 処理失敗

export type SourceFileType = 'pdf' | 'docx' | 'txt';
```

---

## 3. チャンク分割戦略

### 3.1 採用パラメータ

```typescript
const CHUNK_CONFIG = {
  maxCharsPerChunk: 800,
  overlapChars: 100,
};
```

### 3.2 採用理由

| 理由 | 詳細 |
|------|------|
| 介護資料は段落構造が不安定 | 厚労省PDFはレイアウト崩れ多発、構造抽出は信頼できない |
| 800文字は埋め込みモデルに適切 | text-embedding-004 の上限2048トークンに余裕、複数文を含む意味のまとまりを保てる |
| 100文字オーバーラップで文脈保持 | 段落境界・リスト項目の分断を緩和、チャンク数増加は12.5%程度 |

### 3.3 ファイル形式別の前処理

| 形式 | 抽出ライブラリ | 注意点 |
|------|--------------|--------|
| **txt** | Node.js 標準 | UTF-8 前提、エンコーディング判定 |
| **docx** | `mammoth` | テキストのみ抽出、画像は無視 |
| **PDF** | `pdf-parse` または `unpdf` | 文字化け対応必須、スキャンPDFは MVP対象外 |

### 3.4 スキャンPDF(画像PDF)の扱い

MVP では OCR 処理は実装せず、テキスト抽出可能な PDF のみサポート。
スキャンPDFがアップロードされた場合は `processing_status = 'failed'` とし、
ユーザーに「テキスト抽出できないファイルです」と通知する。

---

## 4. データベース設計

### 4.1 pgvector 拡張の有効化

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 4.2 knowledge_documents テーブル

```sql
CREATE TABLE knowledge_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  
  -- スコープ・所有者
  scope                   VARCHAR(20) NOT NULL,
  owner_id                UUID REFERENCES app_users(id),
  
  -- メタ情報
  title                   TEXT NOT NULL,
  source_file_url         TEXT NOT NULL,         -- Supabase Storage の signed URL
  source_file_path        TEXT NOT NULL,         -- Storage のパス(削除用)
  source_file_type        VARCHAR(10) NOT NULL,
  source_file_size_bytes  BIGINT NOT NULL,
  
  -- 処理ステータス
  processing_status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  processing_error        TEXT,
  
  -- メタ
  uploaded_by             UUID NOT NULL REFERENCES app_users(id),
  uploaded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- スタックジョブ救済 (§8.4) で参照
  ready_at                TIMESTAMPTZ,
  
  -- 楽観的ロック
  version                 INTEGER NOT NULL DEFAULT 1,
  
  CONSTRAINT knowledge_doc_scope_valid
    CHECK (scope IN ('personal', 'shared')),
  CONSTRAINT knowledge_doc_status_valid
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT knowledge_doc_file_type_valid
    CHECK (source_file_type IN ('pdf', 'docx', 'txt')),
  CONSTRAINT knowledge_doc_personal_has_owner
    CHECK (
      (scope = 'personal' AND owner_id IS NOT NULL) OR
      (scope = 'shared' AND owner_id IS NULL)
    ),
  CONSTRAINT knowledge_doc_ready_consistency
    CHECK (
      (processing_status = 'ready' AND ready_at IS NOT NULL) OR
      (processing_status != 'ready')
    )
);

CREATE INDEX idx_knowledge_docs_tenant_scope
  ON knowledge_documents(tenant_id, scope);
CREATE INDEX idx_knowledge_docs_tenant_owner
  ON knowledge_documents(tenant_id, owner_id);
CREATE INDEX idx_knowledge_docs_status
  ON knowledge_documents(tenant_id, processing_status);

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_knowledge_docs_touch
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
```

### 4.3 knowledge_chunks テーブル

```sql
CREATE TABLE knowledge_chunks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  document_id             UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  
  -- スコープ情報を非正規化(RLS と検索性能のため重要、4.4参照)
  scope                   VARCHAR(20) NOT NULL,
  owner_id                UUID,
  
  -- チャンク本体
  sequence_no             INTEGER NOT NULL,
  text                    TEXT NOT NULL,
  embedding               VECTOR(768) NOT NULL,
  page_number             INTEGER,
  
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT chunk_sequence_unique
    UNIQUE (document_id, sequence_no),
  CONSTRAINT chunk_text_not_empty
    CHECK (length(trim(text)) > 0),
  CONSTRAINT chunk_scope_valid
    CHECK (scope IN ('personal', 'shared')),
  -- documents 側と同じ整合条件をチャンク側にも重複して持たせる(非正規化の対として)
  CONSTRAINT chunk_personal_has_owner
    CHECK (
      (scope = 'personal' AND owner_id IS NOT NULL) OR
      (scope = 'shared' AND owner_id IS NULL)
    )
);

-- B-tree インデックス
CREATE INDEX idx_chunks_tenant_doc
  ON knowledge_chunks(tenant_id, document_id);

-- ベクトル類似度検索用 HNSW インデックス
CREATE INDEX idx_chunks_embedding_hnsw
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);
```

### 4.4 重要な設計判断: スコープ情報の非正規化

`knowledge_chunks` に `scope` と `owner_id` を **document からコピーして持たせる**。
正規化原則からするとアンチパターンに見えるが、**意図的な選択**。

| 理由 | 詳細 |
|------|------|
| RLS 性能 | チャンク検索のたびに `knowledge_documents` を JOIN してアクセス制御するとベクトル検索が遅くなる |
| ベクトル検索の絞り込み | WHERE 句でスコープ・所有者を先に絞ってからベクトル検索する方が圧倒的に速い |
| RLS ポリシーの単純化 | チャンクテーブルだけで完結したポリシーが書ける |

**トレードオフ**: ドキュメントのスコープ変更時にチャンクも更新が必要。
MVP ではスコープ変更を許可しない方針で逃げる(必要なら削除→再アップロード運用)。

### 4.5 設計判断のまとめ

| 判断 | 理由 |
|------|------|
| `scope` を ENUM ではなく VARCHAR + CHECK | 他テーブルと同じ方針、追加が容易 |
| `processing_error` を TEXT で保持 | 失敗時のデバッグ情報、ユーザーにも一部表示可能 |
| `source_file_path` を別カラムで保持 | Storage 削除時に signed URL ではなくパスが必要 |
| `version` カラムによる楽観的ロック | 他集約と同じ方針(タイトル更新等を想定) |
| HNSW インデックスを採用 | 継続追加に強い、検索性能が UX に直結 |
| 非正規化で `scope`/`owner_id` を持つ | RLS 性能・ベクトル検索性能を優先 |

---

## 5. RLS 設計 — 個人/共有のアクセス制御

### 5.1 アクセス制御要件

| アクセス対象 | 誰がアクセスできるか |
|------------|-------------------|
| 共有ナレッジ(`scope='shared'`) | 同一テナントの全員 |
| 個人ナレッジ(`scope='personal'`) | 所有者本人のみ |

### 5.2 推奨実装: SECURITY INVOKER 関数で集約

```sql
-- 共通のアクセス判定関数
CREATE OR REPLACE FUNCTION can_access_knowledge(
  p_tenant_id UUID,
  p_scope VARCHAR,
  p_owner_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_user_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_user_tenant_id
  FROM app_users WHERE id = auth.uid();
  
  -- テナント不一致は問答無用で拒否
  IF v_user_tenant_id IS NULL OR v_user_tenant_id != p_tenant_id THEN
    RETURN FALSE;
  END IF;
  
  -- 共有 or 自分のもの
  RETURN p_scope = 'shared'
      OR (p_scope = 'personal' AND p_owner_id = auth.uid());
END;
$$;

-- ポリシー側は薄く保つ
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY chunk_access ON knowledge_chunks
  FOR ALL
  USING (can_access_knowledge(tenant_id, scope, owner_id))
  WITH CHECK (can_access_knowledge(tenant_id, scope, owner_id));

CREATE POLICY doc_access ON knowledge_documents
  FOR ALL
  USING (can_access_knowledge(tenant_id, scope, owner_id))
  WITH CHECK (can_access_knowledge(tenant_id, scope, owner_id));
```

### 5.3 設計のメリット

| メリット | 詳細 |
|---------|------|
| 判定ロジックが1箇所に集約 | 関数を変えるだけで全テーブルのポリシーが変わる |
| 2テーブルで同じロジックを共有 | knowledge_chunks と knowledge_documents の重複なし |
| 将来拡張が容易 | チーム単位の共有等を追加する場合も関数を変えるだけ |
| `FOR ALL` で USING/WITH CHECK 両対応 | INSERT/UPDATE/DELETE/SELECT 全てカバー。ナレッジは §9.2 `DeleteKnowledgeDocumentUseCase` で物理削除するため、DELETE が `FOR ALL` で許可されている点が重要 |

---

## 6. ベクトル検索クエリの実装

### 6.1 RPC 関数化

```sql
CREATE OR REPLACE FUNCTION search_knowledge(
  p_query_embedding VECTOR(768),
  p_tenant_id UUID,
  p_top_k INTEGER DEFAULT 5,
  p_min_similarity REAL DEFAULT 0.5
) RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  document_title TEXT,
  chunk_text TEXT,
  page_number INTEGER,
  scope VARCHAR,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS を有効にする
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    d.title,
    c.text,
    c.page_number,
    c.scope,
    (1 - (c.embedding <=> p_query_embedding))::REAL AS similarity
  FROM knowledge_chunks c
  JOIN knowledge_documents d ON c.document_id = d.id
  WHERE c.tenant_id = p_tenant_id
    AND d.processing_status = 'ready'
    AND (1 - (c.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$;
```

### 6.2 検索クエリの設計ポイント

| ポイント | 詳細 |
|---------|------|
| `<=>` 演算子 | pgvector のコサイン距離演算子 |
| `1 - 距離 = 類似度` | 表示用に類似度(0-1)に変換 |
| `processing_status = 'ready'` | 処理中・失敗ドキュメントを除外 |
| `SECURITY INVOKER` | RLS が自動適用される |
| `min_similarity` パラメータ | ノイズ除去のための閾値(MVP デフォルト0.5) |

---

## 7. PII マスキングとの関係

`pii-masking-design.md` との整合を確保するため、ナレッジ利用時の PII 流入経路を場面別に整理する。

### 7.1 方針サマリ

| 場面 | PII 流入の可能性 | MVP での扱い | 理由 |
|------|----------------|------------|------|
| 共有ナレッジ(制度資料)のアップロード | ほぼなし | マスキング適用せずそのまま埋め込み | 厚労省資料等、PII を含まない一般資料が前提 |
| 個人ナレッジ(ケアマネのメモ)のアップロード | 高い(利用者氏名等) | **アップロード時に警告表示 + 人手確認**、本文は保存 | ケアマネの業務メモは属人知識の集約先。技術的マスキングより利用規約・運用教育で担保 |
| 個人ナレッジ本文を Gemini Embedding に送信 | あり(個人ナレッジ本文そのもの) | **許容**(利用規約で同意取得) | Embedding API は Gemini の生成トラフィックと同等に扱われるが、本用途では送信が必要。同一テナントから出ない RLS で守る |
| ケアプランドラフト生成時の検索クエリ | あり(アセスメント課題テキスト由来) | **クエリはアセスメントのマスク済みテキストを使用** | `care-manager-ai-design.md` §7.7 で既に設計済み。PII を Embedding に渡さない |
| RAG 検索結果の Gemini 投入 | あり(個人ナレッジ本文) | **Gemini に渡す前に再マスキング**(§7.3) | 個人ナレッジに PII が紛れ込んでいる可能性を想定した多層防御 |

### 7.2 個人ナレッジアップロード時の運用制約

技術的マスキングは採用しないが、**利用規約上の遵守義務** と **UI 警告** で担保する。

```typescript
// application/knowledge/UploadKnowledgeDocumentUseCase.ts
// (抜粋)

// scope='personal' の場合、UI 側で警告バナーを必ず表示する契約
// UseCase 側では invariant として確認はしないが、ログに scope 情報を残す
await this.auditLog.save({
  tenantId,
  kind: 'knowledge_upload',
  uploadedBy: userId,
  scope: input.scope,
  title: input.title,
  fileSizeBytes: input.sourceFile.sizeBytes,
});
```

**UI 実装ルール(別ドキュメントの UI 設計で詳細化)**:
- 個人ナレッジアップロード画面: 「利用者氏名・住所などの PII が含まれていないか確認してください」の警告とチェックボックス必須
- アップロード後の一覧: 個人ナレッジは「あなただけが見られます」バッジを表示

### 7.3 RAG 検索結果を Gemini に渡す前の再マスキング

`knowledge_chunks.text` は原則マスク済みでないため、ケアプランドラフト生成時に Gemini プロンプトに投入する際、**二重防御として再マスキングを通す**。

```typescript
// application/care-management/care-plan-draft/GenerateCarePlanDraftUseCase.ts
// (care-manager-ai-design.md §7.7 の補足)

// ステップ2.5(RAG 検索結果を Gemini に渡す前の PII 再マスキング)
const knownPiis = await this.careRecipientRepo.buildKnownPiiSetForTenant(tenantId);
const reMaskedSnippets = await Promise.all(
  relevantKnowledge.map(async (k) => {
    const maskingResult = await this.piiMasking.mask(k.chunkText, knownPiis);
    return {
      title: k.documentTitle,
      text: maskingResult.maskedText,
      source: `${k.documentTitle} p.${k.chunkPageNumber ?? '-'}`,
      similarity: k.similarity,
    };
  }),
);
// 以降、reMaskedSnippets を Gemini に渡す
```

**この設計の本質**: 個人ナレッジに利用者氏名が紛れ込んでいても、Gemini に投入される最終プロンプトには PII が含まれないことが保証される。

**最適化余地（実装着手後の判断）**: 共有ナレッジ（`scope='shared'`、制度資料）は §7.1 の方針で PII を含まない前提のため、再マスキングは理論上不要。運用時にレイテンシが問題になれば `scope='personal'` のチャンクのみに再マスキング対象を絞る最適化を検討（`care-manager-ai-design.md §10.3`）。

### 7.4 検索クエリ側の PII 取り扱い

- ケアプランドラフト生成時の検索クエリは **アセスメントのマスク済み要約から生成** する(`assessment.maskedSummary` or `assessment.issues[].description`、いずれもマスク済み)
- そのため、Gemini Embedding API にも PII は渡らない
- 手動検索 UI を将来追加する場合は、クエリ文字列に対して `StructuredPiiMaskingService` を適用してから Embedding する

### 7.5 設計判断サマリ

| 判断 | 理由 |
|------|------|
| 共有ナレッジはマスキング不要 | 一般資料前提、マスキング処理のコストが無意味 |
| 個人ナレッジのアップロード時マスキングは見送り | 技術的に網羅的マスキングが困難。UI 警告 + 利用規約で代替 |
| RAG 結果 → Gemini の経路で再マスキングを実施 | 多層防御。個人ナレッジの取り扱い齟齬を吸収 |
| 検索クエリはマスク済み入力から生成 | Embedding API にも PII を渡さない |

---

## 8. バックグラウンド処理(埋め込み生成ジョブ)

### 8.1 処理フロー

```
[ユーザー]         [API Route/Server Action]    [pg_cron]              [Worker(Vercel Cron)]
─────────────────────────────────────────────────────────────────────────────────────────
1. ファイルアップロード
   ↓
2. Supabase Storage に保存
   ↓
3. knowledge_documents に INSERT
   status='pending'
   ↓
                                                ... 1分後 ...
                                                ↓
                                                4. Vercel Cron が起動
                                                   /api/cron/process-knowledge
                                                ↓
                                                5. status='pending' の
                                                   ドキュメントを N 件取得
                                                ↓
                                                6. status='processing' に UPDATE
                                                   (楽観的ロックで多重起動防止)
                                                ↓
                                                7. Storage からファイル取得
                                                ↓
                                                8. テキスト抽出
                                                   (pdf-parse/mammoth/等)
                                                ↓
                                                9. 800文字+100overlap でチャンク分割
                                                ↓
                                                10. Gemini Embedding API
                                                    (text-embedding-004)
                                                    でベクトル化
                                                ↓
                                                11. markAsReady(chunks) で
                                                    チャンク登録 + ready 化を原子実行
```

### 8.2 選択肢の比較と採用理由

| 候補 | 仕組み | メリット | デメリット | 採否 |
|------|-------|---------|----------|------|
| 1. Vercel Cron(定期実行) | 毎分 `/api/cron/*` を叩く | Vercel と同じランタイム、運用統一 | 最大遅延1分、Vercel 関数タイムアウト(60秒)に注意 | ✅ 採用 |
| 2. Supabase Edge Functions + Database Webhooks | INSERT をフックして即実行 | リアルタイム、Supabase 内完結 | Edge Functions の運用・監視が別系統に分かれる | ❌ MVP で運用二重化を避ける |
| 3. pg_cron + 外部 API | Postgres スケジューラから fetch | SQL だけで完結 | SQL の fetch 拡張導入が必要、エラーハンドリング弱 | ❌ MVP には複雑すぎる |

**採用理由**: Vercel Cron が **Next.js と同じコードベース** で動かせるため、MVP の運用負荷を最小化できる。ジョブ関数もユースケース層を共有できる。

**運用プランの前提**: Vercel Hobby プランでは Cron が1日1回までに制限され、本設計の「毎分起動」が実現できない。本アプリは **Vercel Pro 以上** を前提とする(毎分 Cron + 最大 300 秒の関数タイムアウト可)。これに合わせて本節のバッチサイズ・タイムアウト余裕値は Pro 前提のパラメータ。Hobby プランで試験運用する場合は、Cron の代わりに Supabase Edge Functions + Database Webhooks(§8.2 候補2) へ切り替える。

### 8.3 ジョブ実装

```typescript
// app/api/cron/process-knowledge/route.ts

export async function GET(request: Request) {
  // Vercel Cron の認証(CRON_SECRET)
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const container = buildContainer();
  const result = await container.processKnowledgeEmbeddingsUseCase.execute({
    batchSize: 3,              // 1 起動あたり最大 3 件(60秒タイムアウト対策)
    timeoutMarginMs: 10_000,   // 残り10秒でタイムアウト扱い
  });

  return Response.json({
    processed: result.processed,
    failed: result.failed,
  });
}
```

```typescript
// application/knowledge/ProcessKnowledgeEmbeddingsUseCase.ts

export class ProcessKnowledgeEmbeddingsUseCase {
  constructor(
    private readonly documentRepo: IKnowledgeDocumentRepository,
    private readonly storageService: IKnowledgeStorageService,
    private readonly textExtractor: ITextExtractor,
    private readonly textChunker: ITextChunker,
    private readonly embeddingService: IEmbeddingService,
  ) {}

  async execute(input: { batchSize: number; timeoutMarginMs: number }): Promise<ProcessResult> {
    const startedAt = Date.now();
    const pendings = await this.documentRepo.findPendingDocuments(input.batchSize);

    const processed: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const doc of pendings) {
      // Vercel タイムアウト接近時は切り上げ
      if (Date.now() - startedAt > 60_000 - input.timeoutMarginMs) break;

      try {
        doc.markAsProcessing();
        await this.documentRepo.save(doc); // 他ワーカーによる重複取得を防ぐ

        const buffer = await this.storageService.download(doc.sourceFile.storagePath);
        const rawText = await this.textExtractor.extract(buffer, doc.sourceFile.type);
        const splits = this.textChunker.split(rawText, { maxChars: 800, overlapChars: 100 });

        // チャンクごとに Embedding(レート制限対応のため並列度を制限)
        const chunks: KnowledgeChunk[] = [];
        for (let i = 0; i < splits.length; i++) {
          const embedding = await this.embeddingService.embed(splits[i].text);
          chunks.push(KnowledgeChunk.create({
            sequenceNo: i,
            text: splits[i].text,
            embedding,
            pageNumber: splits[i].pageNumber,
          }));
        }

        doc.markAsReady(chunks);
        await this.documentRepo.save(doc);
        processed.push(doc.id.value);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        try {
          doc.markAsFailed(reason);
          await this.documentRepo.save(doc);
        } catch {
          /* ignore secondary error */
        }
        failed.push({ id: doc.id.value, reason });
      }
    }

    return { processed, failed };
  }
}
```

### 8.4 リトライ戦略

| 失敗原因 | リトライ方針 |
|---------|------------|
| Gemini Embedding 一時エラー(5xx) | 同一ドキュメントを `failed` にせず `pending` に戻す(最大3回、別カラム `retry_count` で管理) |
| テキスト抽出失敗(ファイル破損等) | 即座に `failed`、`processing_error` に理由を記録。ユーザーに通知 |
| Vercel タイムアウト | 次回起動で再ピックアップ(`status='processing'` かつ `updated_at > 5分前` を pending 扱いに) |

```sql
-- スタックジョブの救済クエリ(Cron 起動時の冒頭で実行)
-- updated_at は §4.2 のトリガーで自動更新される
UPDATE knowledge_documents
SET processing_status = 'pending', version = version + 1
WHERE processing_status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

**MVP では `retry_count` カラムは持たず、失敗=ユーザーに削除・再アップロードを促す**。運用して必要性が出たら追加。

### 8.5 大容量ファイル対策

| 対策 | 内容 |
|------|------|
| ファイルサイズ上限 20MB | `SourceFile.create` のバリデーション + Storage 側の制限 |
| 1バッチあたり最大3件 | Vercel 関数 60秒タイムアウト内で完了させる |
| ドキュメントあたりチャンク数上限 | MVP は上限なし。200チャンクを超える場合は運用者が確認(監視で判断) |
| Embedding 並列化 | 1チャンクずつ逐次。`gemini-embedding-004` のレート制限(RPM)に収まる設計 |

---

## 9. ユースケース層の設計

### 9.1 UploadKnowledgeDocumentUseCase

```typescript
// application/knowledge/UploadKnowledgeDocumentUseCase.ts

export interface UploadKnowledgeDocumentInput {
  auth: AuthorizationContext;
  scope: KnowledgeScope;
  title: string;
  uploadedFile: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  };
}

export class UploadKnowledgeDocumentUseCase
  implements IUseCase<UploadKnowledgeDocumentInput, { documentId: string }> {

  constructor(
    private readonly documentRepo: IKnowledgeDocumentRepository,
    private readonly storageService: IKnowledgeStorageService,
  ) {}

  async execute(input: UploadKnowledgeDocumentInput): Promise<{ documentId: string }> {
    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    // 1. ロール制御: 共有ナレッジは管理者のみ
    if (input.scope === 'shared' && input.auth.role !== 'admin') {
      throw new UseCaseError('FORBIDDEN', '共有ナレッジは管理者のみ登録できます');
    }

    // 2. ファイル種別判定
    const fileType = this.resolveFileType(input.uploadedFile.fileName, input.uploadedFile.mimeType);

    // 3. Storage にアップロード
    const storagePath = `${tenantId.value}/${input.scope}/${crypto.randomUUID()}_${input.uploadedFile.fileName}`;
    const { url } = await this.storageService.upload({
      path: storagePath,
      buffer: input.uploadedFile.buffer,
      contentType: input.uploadedFile.mimeType,
    });

    // 4. 集約生成(pending 状態)
    const document = KnowledgeDocument.create({
      tenantId,
      scope: input.scope,
      ownerId: input.scope === 'personal' ? userId : null,
      title: input.title,
      sourceFile: SourceFile.create({
        url,
        storagePath,
        type: fileType,
        sizeBytes: input.uploadedFile.sizeBytes,
      }),
      uploadedBy: userId,
    });

    // 5. 永続化(この時点で Cron のピックアップ対象になる)
    await this.documentRepo.save(document);

    return { documentId: document.id.value };
  }

  private resolveFileType(fileName: string, mimeType: string): SourceFileType {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
    if (ext === 'docx' || mimeType.includes('wordprocessingml')) return 'docx';
    if (ext === 'txt' || mimeType.startsWith('text/plain')) return 'txt';
    throw new UseCaseError('INVALID_INPUT', `サポートされていないファイル種別: ${fileName}`);
  }
}
```

### 9.2 DeleteKnowledgeDocumentUseCase(ファイル削除クリーンアップ)

削除時は **DB レコード + Storage 実体の両方を消す** 必要があり、整合性に注意。

```typescript
// application/knowledge/DeleteKnowledgeDocumentUseCase.ts

export class DeleteKnowledgeDocumentUseCase
  implements IUseCase<DeleteKnowledgeDocumentInput, void> {

  constructor(
    private readonly documentRepo: IKnowledgeDocumentRepository,
    private readonly storageService: IKnowledgeStorageService,
  ) {}

  async execute(input: DeleteKnowledgeDocumentInput): Promise<void> {
    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    const document = await this.documentRepo.findById(
      new KnowledgeDocumentId(input.documentId), tenantId,
    );
    if (!document) {
      throw new UseCaseError('NOT_FOUND', 'ナレッジが見つかりません');
    }

    // ロール制御: 共有ナレッジは管理者、個人ナレッジは所有者のみ削除可
    if (document.scope === 'shared' && input.auth.role !== 'admin') {
      throw new UseCaseError('FORBIDDEN', '共有ナレッジは管理者のみ削除できます');
    }
    if (document.scope === 'personal' && !document.canBeAccessedBy(userId, tenantId)) {
      throw new UseCaseError('FORBIDDEN', '所有者以外は個人ナレッジを削除できません');
    }

    // 先に DB 削除(子テーブルは ON DELETE CASCADE)
    await this.documentRepo.delete(document.id, tenantId);

    // Storage 削除は best-effort(失敗してもオーファン掃除ジョブで回収)
    try {
      await this.storageService.delete(document.sourceFile.storagePath);
    } catch (error) {
      // オーファン掃除で拾うため、業務エラーにはしない
      console.error('Storage 削除失敗。オーファン掃除で回収予定', error);
    }
  }
}
```

### 9.3 ファイル削除時のクリーンアップ整合性

2 つのストレージ(DB と Supabase Storage)を跨ぐ削除はトランザクションで保証できないため、**Saga 的に扱う**。

#### 9.3.1 削除戦略: 「DB 先行 + オーファン掃除」

| ステップ | 内容 | 失敗時 |
|---------|------|-------|
| 1. DB 削除 | `knowledge_documents` + `knowledge_chunks` 削除(CASCADE) | 失敗 → 業務エラー、ユーザーに通知 |
| 2. Storage 削除 | 元ファイル削除 | 失敗 → ログのみ、Cron で回収 |
| 3. オーファン掃除 Cron | 日次で `storage - DB` の差分を削除 | 失敗 → 次回再試行 |

**「DB 先行」を選ぶ理由**:
- ユーザー視点で最も重要なのは「検索・表示できなくなる」こと = DB からの消去
- Storage の残骸は一時的であれば、RLS で他人からはアクセスできないため実害は小さい
- 逆に Storage 先行だと、「Storage はないが DB にはある = 壊れたリンク」となり UX 上悪い

#### 9.3.2 オーファン掃除ジョブ

```typescript
// application/knowledge/CleanupOrphanedStorageUseCase.ts

export class CleanupOrphanedStorageUseCase {
  async execute(): Promise<{ deleted: number }> {
    // 1. Storage 内の全ファイルリスト(tenant/scope ごと)
    const storagePaths = await this.storageService.listAllPaths();

    // 2. DB 内の全 source_file_path を取得
    const activePaths = await this.documentRepo.findAllStoragePaths();

    // 3. 差分を算出
    const orphaned = storagePaths.filter(p => !activePaths.has(p));

    // 4. 削除
    let deleted = 0;
    for (const path of orphaned) {
      try {
        await this.storageService.delete(path);
        deleted++;
      } catch {
        /* next time */
      }
    }

    return { deleted };
  }
}
```

このジョブも Vercel Cron で日次起動する(`/api/cron/cleanup-knowledge-orphans`)。

#### 9.3.3 削除が処理中(processing)だった場合の扱い

```
削除ユースケース実行時、processing_status='processing' だったら?
```

| 対応 | 内容 |
|------|------|
| MVP | そのまま削除を許可。ワーカー側は `findById → null` になった時点でキャンセル処理 |
| ワーカー側実装 | save 時に `findById` で存在確認、ない場合は処理をスキップ(正常終了扱い) |

```typescript
// ProcessKnowledgeEmbeddingsUseCase 内での save 前チェック
const latest = await this.documentRepo.findById(doc.id, doc.tenantId);
if (!latest) {
  // ユーザーが削除した、スキップ
  return;
}
```

---

## 10. MVP 優先度マトリクス

### 10.1 ドメイン層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `KnowledgeDocument` 集約ルート + ファクトリ + 不変条件 |
| 🔴 必須 | `KnowledgeChunk` 子エンティティ |
| 🔴 必須 | 状態遷移メソッド(`markAsProcessing` / `markAsReady` / `markAsFailed`) |
| 🔴 必須 | `KnowledgeScope` / `ProcessingStatus` / `SourceFileType` 型 |
| 🔴 必須 | `IKnowledgeDocumentRepository` インターフェース |
| 🔴 必須 | `IKnowledgeSearchService` インターフェース |
| 🔴 必須 | `KnowledgeSearchView` Read Model |
| 🟡 推奨 | `EmbeddingVector` / `SourceFile` 値オブジェクト |
| 🟡 推奨 | `canBeAccessedBy` アクセス制御ドメインロジック |
| 🟢 後回し | スコープ変更・所有者譲渡などの操作 |

### 10.2 DB スキーマ

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `vector` 拡張の有効化 |
| 🔴 必須 | `knowledge_documents` / `knowledge_chunks` テーブル |
| 🔴 必須 | `can_access_knowledge` 関数 + RLS |
| 🔴 必須 | HNSW インデックス |
| 🔴 必須 | CHECK 制約(scope, status, file_type, personal_has_owner) |
| 🔴 必須 | `search_knowledge` RPC 関数 |
| 🟡 推奨 | スコープ非正規化(`scope`/`owner_id` をチャンクに) |
| 🟢 後回し | チーム単位の共有スコープ |

### 10.3 リポジトリ・サービス層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `SupabaseKnowledgeDocumentRepository` |
| 🔴 必須 | `SupabaseKnowledgeSearchService` |
| 🔴 必須 | `GeminiEmbeddingService`(埋め込み生成) |
| 🔴 必須 | `IKnowledgeStorageService` / Supabase Storage ラッパ |
| 🟡 推奨 | チャンク分割ユーティリティ(`TextChunker`) |
| 🟡 推奨 | ファイル解析(`PdfParser` / `DocxParser`) |
| 🟢 後回し | 検索結果のリランキング |

### 10.4 ユースケース層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `UploadKnowledgeDocumentUseCase` |
| 🔴 必須 | `DeleteKnowledgeDocumentUseCase`(DB 先行・Storage 後追い) |
| 🔴 必須 | `ProcessKnowledgeEmbeddingsUseCase`(Vercel Cron で起動) |
| 🟡 推奨 | `CleanupOrphanedStorageUseCase`(日次で Storage 残骸回収) |
| 🟡 推奨 | ケアプランドラフト生成時の RAG 結果再マスキング(§7.3) |
| 🟢 後回し | リトライカウントによる高度なリトライ戦略 |

### 10.5 バックグラウンド処理

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | Vercel Cron による埋め込み生成ジョブ起動(毎分) |
| 🔴 必須 | スタックジョブ救済(`processing` のまま5分以上は pending 戻し) |
| 🔴 必須 | 失敗時の `processing_error` 記録 |
| 🟡 推奨 | オーファン掃除 Cron(日次) |
| 🟢 後回し | コスト・レイテンシの Grafana 可視化 |

---

## 11. 残存する未決定事項

本ドキュメントで主要論点は解消したが、以下は運用開始後に判断する。

| 論点 | 判断時期 | MVP 既定動作 |
|------|---------|------------|
| 個人ナレッジの PII 流入対策を技術側にも持たせるか | 運用で見逃しが発生したら | UI 警告 + 運用規約のみ |
| Vercel Cron から Supabase Edge Functions への移行 | Vercel タイムアウトが頻発したら | Vercel Cron 継続 |
| リトライカウントによる指数バックオフ | Gemini API 一時失敗が増えたら | 失敗即 failed 化、ユーザーに再アップロード依頼 |
| HNSW チューニングパラメータ(m, ef_construction) | 検索精度メトリクスを取ってから | pgvector デフォルト |
| チャンクサイズ調整 | 検索ヒット率メトリクスを取ってから | 800文字 + 100オーバーラップ |
| 重複アップロードの検出 | ユーザー要望があれば | 重複許容、管理画面で目視整理 |
| ドキュメントあたりチャンク数上限 | 超過事案が出たら | 上限なし(監視のみ) |
| スキャンPDFの OCR 対応 | 要望があれば | 非対応、`failed` として通知 |

---

## 付録A: 用語集

| 用語 | 定義 |
|------|------|
| RAG | Retrieval-Augmented Generation。ナレッジベースを検索して回答精度を高める AI の仕組み |
| 個人ナレッジ | 各ケアマネジャーが登録する自分専用のメモ・ノウハウ |
| 共有ナレッジ | 管理者が登録し、事業所全員が参照できる制度資料・マニュアル類 |
| 埋め込み(Embedding) | テキストを高次元ベクトルに変換したもの。意味的な類似度計算に使う |
| チャンク | ドキュメントを検索しやすいサイズに分割した断片 |
| pgvector | PostgreSQL の拡張機能。ベクトル型と類似度検索を提供 |
| HNSW | Hierarchical Navigable Small World。pgvector のインデックス方式の1つ、検索速度・精度に優れる |
| IVFFlat | pgvector のインデックス方式の1つ、メモリ効率に優れるが追加更新で再構築が必要なことがある |
| Read Model | CQRS パターンにおける読み取り専用のデータモデル |
| KnowledgeSearchView | 本コンテキストにおける Read Model の名称 |
| スコープ | ナレッジの共有範囲(personal / shared) |

---

## 付録B: 集約境界の選択肢比較(参考)

設計時に検討した3つの候補:

| 候補 | 構造 | メリット | デメリット | 採否 |
|------|------|---------|----------|------|
| 候補1 | 単一集約(ドキュメント+チャンク) | 削除時の整合性が単純 | 1ドキュメント数百チャンクの読み込みが重い | ❌ |
| 候補2 | 2集約(ドキュメント・チャンク独立) | チャンクを独立操作可能 | 集約境界がライフサイクルでなく性能で切られる | ❌ |
| 候補3 | 集約+Read Model(CQRS) | 書き込みは集約整合性、検索は性能優先 | 概念が増える | ✅ |

---

**ドキュメントバージョン**: 0.3(実装前レビュー反映版)
**最終更新**: 2026-04-23
**0.3 の主な変更点**:
- §4.2 `knowledge_documents.updated_at` カラムと更新トリガーを追加(R5 対応、§8.4 スタックジョブ救済クエリで参照)
- §4.3 `knowledge_chunks` に `chunk_personal_has_owner` CHECK 制約を追加(R6 対応、documents との整合)
- §2.5 集約の `version` 加算責務をドメインから剥がし、care-plan/assessment と同じ「RPC/リポジトリで加算」方針に統一(M8 対応)
- §8.2 Vercel Pro 以上前提を明示(M4 対応)
- §5.3 DELETE を明示する注記追加(L3 対応)
**0.2 の主な変更点**:
- PII マスキング連携方針を §7 として追加(個人/共有ナレッジ別、RAG 再マスキング、検索クエリ)
- バックグラウンド処理方針を §8 として追加(Vercel Cron 採用、リトライ、救済クエリ)
- ドメインモデル詳細実装を §2.5〜2.9 として追加(集約ルート・子エンティティ・不変条件)
- ユースケース層(アップロード・削除・Cron)を §9 として追加
- ファイル削除時のクリーンアップ整合性を §9.3 として確定(DB 先行 + オーファン掃除)
- MVP 優先度マトリクスをユースケース層・バックグラウンド処理まで拡張
