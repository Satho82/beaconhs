import { describe, expect, it } from 'vitest'
import { warnAutomationGraph, type AutomationGraph } from './automation'
import type { FlowSubjectProfile } from './flow-subjects'

// REGRESSION: a fully-signed hazard assessment was emailed as a blank JSA
// because the tenant's flow, named "Hazard assessment submitted — email", was
// wired to `on_create`. It fired 16 seconds after the record was started and
// attached a PDF of the empty shell. Nothing in the editor said a word.

const buildUpSubject: FlowSubjectProfile = {
  subjectType: 'module',
  subjectKey: 'hazid',
  label: 'Hazard Assessments',
  triggers: ['on_create', 'on_submit', 'manual'],
  actions: ['send_email'],
  fields: [{ key: 'reference', label: 'Reference' }],
  completionTrigger: 'on_submit',
}

const completeOnCreateSubject: FlowSubjectProfile = {
  ...buildUpSubject,
  subjectKey: 'corrective-actions',
  label: 'Corrective Actions',
  completionTrigger: undefined,
}

function graph(
  trigger: 'on_create' | 'on_submit',
  action: AutomationGraph['nodes'][number]['data'],
): AutomationGraph {
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'trigger', trigger: { trigger } } },
      { id: 'action', position: { x: 100, y: 0 }, data: action },
    ],
    edges: [{ id: 'edge', source: 'trigger', target: 'action', sourceHandle: 'next' }],
  }
}

const emailWithPdf = {
  kind: 'action',
  action: { action: 'send_email', to: [{ type: 'submitter' }], attachPdf: true },
} as AutomationGraph['nodes'][number]['data']

const emailWithoutPdf = {
  kind: 'action',
  action: { action: 'send_email', to: [{ type: 'submitter' }] },
} as AutomationGraph['nodes'][number]['data']

describe('warnAutomationGraph', () => {
  it('warns when a build-up record ships its PDF on create', () => {
    const warnings = warnAutomationGraph(graph('on_create', emailWithPdf), buildUpSubject)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('empty at that moment')
    expect(warnings[0]).toContain('on_submit')
  })

  it('warns for a pinned PDF template just the same', () => {
    const withTemplate = {
      kind: 'action',
      action: { action: 'send_email', to: [{ type: 'submitter' }], pdfTemplateId: 'tpl-1' },
    } as AutomationGraph['nodes'][number]['data']
    expect(warnAutomationGraph(graph('on_create', withTemplate), buildUpSubject)).toHaveLength(1)
  })

  it('stays quiet once the trigger is the completion event', () => {
    expect(warnAutomationGraph(graph('on_submit', emailWithPdf), buildUpSubject)).toEqual([])
  })

  it('stays quiet for a create email that carries no record PDF', () => {
    expect(warnAutomationGraph(graph('on_create', emailWithoutPdf), buildUpSubject)).toEqual([])
  })

  it('stays quiet for subjects that are complete when created', () => {
    // A corrective action is filled in by the person raising it, so emailing its
    // PDF on create is correct — this must not cry wolf.
    expect(warnAutomationGraph(graph('on_create', emailWithPdf), completeOnCreateSubject)).toEqual(
      [],
    )
  })

  it('flags a name that promises submission but triggers on create', () => {
    const warnings = warnAutomationGraph(
      graph('on_create', emailWithoutPdf),
      completeOnCreateSubject,
      'Hazard assessment submitted — email',
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('runs on create')
  })

  it('does not flag a name that matches its create trigger', () => {
    expect(
      warnAutomationGraph(
        graph('on_create', emailWithoutPdf),
        completeOnCreateSubject,
        'Corrective action assigned — email',
      ),
    ).toEqual([])
  })
})
