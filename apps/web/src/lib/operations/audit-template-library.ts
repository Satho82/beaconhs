export type AuditTemplate = {
  key: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  name: string
  description: string
  cadence: 'week' | 'month' | 'quarter' | 'year'
  sections: Array<{ label: string; questions: string[] }>
}

export const auditTemplates: AuditTemplate[] = [
  {
    key: 'weekly',
    name: 'Weekly Hotel Operations Audit',
    description: 'Weekly front office, housekeeping, safety and service-readiness audit.',
    cadence: 'week',
    sections: [
      {
        label: 'Front office and arrivals',
        questions: [
          'VIP preferences and accessible-room requirements are reviewed before each shift.',
          'Open guest requests and complaints have an owner and an agreed follow-up time.',
          'Key control, payment handling and lost-property procedures are being followed.',
          'Daily occupancy, ADR and departure priorities are handed over to the next shift.',
        ],
      },
      {
        label: 'Housekeeping and rooms',
        questions: [
          'Rooms sampled are clean, fully stocked and released only after quality checks.',
          'Out-of-order rooms, maintenance defects and deep-clean requirements are logged and owned.',
          'PEEP-related guest arrangements and accessible rooms are checked and communicated.',
          'Public areas, toilets and back-of-house routes meet hygiene standards.',
        ],
      },
      {
        label: 'Safety and service controls',
        questions: [
          'Fire exits, escape routes and emergency equipment are unobstructed and available.',
          'Security, incidents and safeguarding concerns have been logged and escalated correctly.',
          'Team briefings cover occupancy, VIPs, events, risks and operational priorities.',
        ],
      },
    ],
  },
  {
    key: 'monthly',
    name: 'Monthly Hotel Compliance Audit',
    description: 'Monthly compliance, building condition, contractor and record-control audit.',
    cadence: 'month',
    sections: [
      {
        label: 'Compliance records',
        questions: [
          'Statutory certificates, risk assessments and operational registers are current and accessible.',
          'Training, induction and competency records are current for active staff and contractors.',
          'Incident investigations, corrective actions and overdue actions are reviewed by management.',
          'Required inspections and maintenance records are complete, signed off and traceable.',
        ],
      },
      {
        label: 'Building and equipment',
        questions: [
          'Fire-safety equipment, emergency lighting and signage show no unaddressed defects.',
          'Plant rooms, electrical areas and service risers are secure and authorised-access only.',
          'Lifts, water systems, HVAC and critical equipment have current PPM evidence.',
          'Waste, pest control, chemical storage and environmental controls are satisfactory.',
        ],
      },
      {
        label: 'People and governance',
        questions: [
          'Rota coverage, rest breaks and escalation coverage meet operational requirements.',
          'Service failures and repeat complaint trends have corrective owners.',
        ],
      },
    ],
  },
  {
    key: 'quarterly',
    name: 'Quarterly Property Assurance Audit',
    description:
      'Quarterly leadership review of property risk, service quality and financial controls.',
    cadence: 'quarter',
    sections: [
      {
        label: 'Risk and assurance',
        questions: [
          'Risk assessments reflect current operations, occupancy patterns and material changes.',
          'Business continuity, emergency response and evacuation arrangements have been reviewed.',
          'High-risk contractors and supplier performance have been assessed and documented.',
          'Open audit findings are risk-rated, resourced and escalated where overdue.',
        ],
      },
      {
        label: 'Guest experience',
        questions: [
          'Guest feedback, review scores and complaint themes are analysed with evidenced actions.',
          'Room-product, accessibility, cleanliness and presentation standards are sampled and scored.',
          'VIP, groups and event delivery processes are tested against documented standards.',
        ],
      },
      {
        label: 'Commercial controls',
        questions: [
          'Occupancy, ADR, RevPAR and channel trends are reviewed with corrective actions.',
          'Maintenance backlog, asset condition and lifecycle risks are reviewed with ownership.',
          'Utilities consumption and sustainability actions are reviewed against variance.',
        ],
      },
    ],
  },
  {
    key: 'yearly',
    name: 'Annual Hotel Governance Audit',
    description:
      'Annual full-scope audit for operational resilience, statutory compliance and strategic improvement.',
    cadence: 'year',
    sections: [
      {
        label: 'Annual governance',
        questions: [
          'Annual policies, delegations, emergency plans and governance calendars have been approved.',
          'Material risk assessments and compliance registers have been reviewed and re-authorised.',
          'External audit, insurer, owner and regulator findings have closure evidence.',
          'Annual supplier and contractor due diligence is complete for critical providers.',
        ],
      },
      {
        label: 'Asset resilience',
        questions: [
          'The annual PPM programme is complete or has approved recovery plans.',
          'Asset condition, capital priorities and replacement risks are reviewed against the property plan.',
          'Life-safety, water hygiene, electrical and fire-system annual evidence is complete.',
        ],
      },
      {
        label: 'Performance and people',
        questions: [
          'Annual guest experience, quality, incident and complaint trends have executive review.',
          'Training effectiveness, competency gaps and coverage risks are actioned.',
          'The next-year improvement plan has named owners, dates and measurable outcomes.',
        ],
      },
    ],
  },
]
