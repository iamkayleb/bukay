'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyChanges, isDocumentationFile, isDockerRelated, isWorkflowFile } = require('../detect-changes.js');

describe('isDocumentationFile', () => {
  it('recognises .md files', () => {
    assert.equal(isDocumentationFile('README.md'), true);
    assert.equal(isDocumentationFile('agents/claude-46.md'), true);
    assert.equal(isDocumentationFile('docs/guide.mdx'), true);
  });

  it('returns false for source files', () => {
    assert.equal(isDocumentationFile('src/index.js'), false);
    assert.equal(isDocumentationFile('scripts/run.py'), false);
  });

  it('returns false for an empty string', () => {
    assert.equal(isDocumentationFile(''), false);
  });
});

describe('isDockerRelated', () => {
  it('recognises Dockerfile variants', () => {
    assert.equal(isDockerRelated('Dockerfile'), true);
    assert.equal(isDockerRelated('docker/Dockerfile.dev'), true);
    assert.equal(isDockerRelated('.dockerignore'), true);
  });

  it('returns false for unrelated files', () => {
    assert.equal(isDockerRelated('src/app.py'), false);
  });
});

describe('isWorkflowFile', () => {
  it('recognises workflow files', () => {
    assert.equal(isWorkflowFile('.github/workflows/ci.yml'), true);
  });

  it('returns false for non-workflow files', () => {
    assert.equal(isWorkflowFile('.github/scripts/detect-changes.js'), false);
  });
});

describe('classifyChanges', () => {
  it('doc-only when all files are docs', () => {
    const result = classifyChanges(['README.md', 'docs/guide.md']);
    assert.equal(result.docOnly, true);
    assert.equal(result.reason, 'docs_only');
    assert.equal(result.dockerChanged, false);
    assert.equal(result.workflowChanged, false);
  });

  it('not doc-only when code files are present', () => {
    const result = classifyChanges(['README.md', 'src/index.js']);
    assert.equal(result.docOnly, false);
    assert.equal(result.reason, 'code_changes');
  });

  it('detects workflow changes', () => {
    const result = classifyChanges(['.github/workflows/ci.yml']);
    assert.equal(result.workflowChanged, true);
  });

  it('detects docker changes', () => {
    const result = classifyChanges(['Dockerfile', 'src/app.py']);
    assert.equal(result.dockerChanged, true);
    assert.equal(result.docOnly, false);
  });

  it('no_changes reason when empty list', () => {
    const result = classifyChanges([]);
    assert.equal(result.hasChanges, false);
    assert.equal(result.reason, 'no_changes');
    assert.equal(result.docOnly, true);
  });

  it('deduplicates filenames', () => {
    const result = classifyChanges(['src/a.js', 'src/a.js']);
    assert.equal(result.changedFiles.length, 1);
  });
});
