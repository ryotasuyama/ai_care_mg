import { describe, it, expect } from 'vitest';
import { KnowledgeDocument } from './KnowledgeDocument';
import { KnowledgeChunk } from './KnowledgeChunk';
import { EmbeddingVector } from './EmbeddingVector';
import { SourceFile } from './SourceFile';
import { KnowledgeValidationError } from './KnowledgeValidationError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';

const tenantId = new TenantId('tenant-1');
const userId = new UserId('user-1');

function makeSourceFile() {
  return SourceFile.create({
    url: 'https://example.com/file.pdf',
    storagePath: 'tenant-1/shared/file.pdf',
    type: 'pdf',
    sizeBytes: 1024,
  });
}

function makeChunk(seq: number): KnowledgeChunk {
  return KnowledgeChunk.create({
    sequenceNo: seq,
    text: `chunk-${seq}`,
    embedding: EmbeddingVector.create(new Array(768).fill(0.1)),
    pageNumber: seq,
  });
}

describe('KnowledgeDocument.create', () => {
  it('creates a personal document with owner', () => {
    const doc = KnowledgeDocument.create({
      tenantId,
      scope: 'personal',
      ownerId: userId,
      title: '個人メモ',
      sourceFile: makeSourceFile(),
      uploadedBy: userId,
    });
    expect(doc.scope).toBe('personal');
    expect(doc.processingStatus).toBe('pending');
    expect(doc.version).toBe(1);
    expect(doc.chunks).toHaveLength(0);
  });

  it('rejects personal document without owner', () => {
    expect(() =>
      KnowledgeDocument.create({
        tenantId,
        scope: 'personal',
        ownerId: null,
        title: 't',
        sourceFile: makeSourceFile(),
        uploadedBy: userId,
      }),
    ).toThrow(KnowledgeValidationError);
  });

  it('rejects shared document with owner', () => {
    expect(() =>
      KnowledgeDocument.create({
        tenantId,
        scope: 'shared',
        ownerId: userId,
        title: 't',
        sourceFile: makeSourceFile(),
        uploadedBy: userId,
      }),
    ).toThrow(KnowledgeValidationError);
  });

  it('rejects empty title', () => {
    expect(() =>
      KnowledgeDocument.create({
        tenantId,
        scope: 'shared',
        ownerId: null,
        title: '   ',
        sourceFile: makeSourceFile(),
        uploadedBy: userId,
      }),
    ).toThrow(KnowledgeValidationError);
  });
});

describe('KnowledgeDocument state transitions', () => {
  function newDoc() {
    return KnowledgeDocument.create({
      tenantId,
      scope: 'shared',
      ownerId: null,
      title: 't',
      sourceFile: makeSourceFile(),
      uploadedBy: userId,
    });
  }

  it('pending -> processing -> ready', () => {
    const doc = newDoc();
    doc.markAsProcessing();
    expect(doc.processingStatus).toBe('processing');
    doc.markAsReady([makeChunk(0), makeChunk(1)]);
    expect(doc.processingStatus).toBe('ready');
    expect(doc.chunks).toHaveLength(2);
    expect(doc.readyAt).not.toBeNull();
  });

  it('rejects ready before processing', () => {
    const doc = newDoc();
    expect(() => doc.markAsReady([makeChunk(0)])).toThrow(IllegalStateTransitionError);
  });

  it('rejects ready with no chunks', () => {
    const doc = newDoc();
    doc.markAsProcessing();
    expect(() => doc.markAsReady([])).toThrow(KnowledgeValidationError);
  });

  it('rejects ready with duplicate sequence_no', () => {
    const doc = newDoc();
    doc.markAsProcessing();
    expect(() => doc.markAsReady([makeChunk(0), makeChunk(0)])).toThrow(
      KnowledgeValidationError,
    );
  });

  it('failed from pending', () => {
    const doc = newDoc();
    doc.markAsFailed('テキスト抽出失敗');
    expect(doc.processingStatus).toBe('failed');
    expect(doc.processingError).toBe('テキスト抽出失敗');
  });

  it('failed from processing', () => {
    const doc = newDoc();
    doc.markAsProcessing();
    doc.markAsFailed('embed失敗');
    expect(doc.processingStatus).toBe('failed');
  });

  it('rejects failed from ready', () => {
    const doc = newDoc();
    doc.markAsProcessing();
    doc.markAsReady([makeChunk(0)]);
    expect(() => doc.markAsFailed('再失敗')).toThrow(IllegalStateTransitionError);
  });
});

describe('KnowledgeDocument.canBeAccessedBy', () => {
  const otherUser = new UserId('user-other');
  const otherTenant = new TenantId('tenant-2');

  it('shared: any user in same tenant', () => {
    const doc = KnowledgeDocument.create({
      tenantId,
      scope: 'shared',
      ownerId: null,
      title: 't',
      sourceFile: makeSourceFile(),
      uploadedBy: userId,
    });
    expect(doc.canBeAccessedBy(otherUser, tenantId)).toBe(true);
  });

  it('shared: blocks other tenant', () => {
    const doc = KnowledgeDocument.create({
      tenantId,
      scope: 'shared',
      ownerId: null,
      title: 't',
      sourceFile: makeSourceFile(),
      uploadedBy: userId,
    });
    expect(doc.canBeAccessedBy(otherUser, otherTenant)).toBe(false);
  });

  it('personal: only owner', () => {
    const doc = KnowledgeDocument.create({
      tenantId,
      scope: 'personal',
      ownerId: userId,
      title: 't',
      sourceFile: makeSourceFile(),
      uploadedBy: userId,
    });
    expect(doc.canBeAccessedBy(userId, tenantId)).toBe(true);
    expect(doc.canBeAccessedBy(otherUser, tenantId)).toBe(false);
  });
});

describe('EmbeddingVector', () => {
  it('rejects non-768 dimensions', () => {
    expect(() => EmbeddingVector.create([1, 2, 3])).toThrow(KnowledgeValidationError);
  });

  it('serializes to pgvector literal', () => {
    const v = EmbeddingVector.create([0.1, 0.2, ...new Array(766).fill(0)]);
    const literal = v.toPgVectorLiteral();
    expect(literal.startsWith('[0.1,0.2,')).toBe(true);
    expect(literal.endsWith(']')).toBe(true);
  });
});

describe('SourceFile', () => {
  it('rejects > 20MB', () => {
    expect(() =>
      SourceFile.create({
        url: 'x',
        storagePath: 'p',
        type: 'pdf',
        sizeBytes: 21 * 1024 * 1024,
      }),
    ).toThrow(KnowledgeValidationError);
  });

  it('rejects unknown type', () => {
    expect(() =>
      // @ts-expect-error 不正な type 値
      SourceFile.create({ url: 'x', storagePath: 'p', type: 'xml', sizeBytes: 100 }),
    ).toThrow(KnowledgeValidationError);
  });
});
