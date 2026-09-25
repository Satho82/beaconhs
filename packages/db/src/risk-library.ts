import type { AdoptedRiskTemplateSnapshot, RiskTemplateHazard } from './schema/risk'

export const PLATFORM_RISK_TEMPLATE_OWNER = '00000000-0000-0000-0000-000000000000'
export const SLIPS_TRIPS_TEMPLATE_ID = '1044c44e-ec35-4fcb-8fea-962d62ee72a4'

export const RISK_LIBRARY_CATEGORIES = [
  'catering',
  'engineering',
  'front_of_house',
  'general',
  'hotel_general',
  'housekeeping',
  'kitchen',
  'leisure',
  'meetings_events',
  'personal',
  'property',
  'restaurant',
] as const

export const SLIPS_TRIPS_HAZARDS: RiskTemplateHazard[] = [
  {
    hazard: 'Wet or slippery floors',
    harm: 'A person may lose their footing and fall, causing sprains, fractures, or impact injuries.',
    peopleAtRisk: ['Employees', 'Guests', 'Contractors', 'Visitors'],
    standardControls: [
      'Clean spills promptly and display warning signs while the surface remains wet.',
      'Use suitable entrance matting and a planned cleaning inspection routine.',
      'Provide slip-resistant footwear where the task requires it.',
    ],
    initialLikelihood: 4,
    initialSeverity: 3,
    residualLikelihood: 2,
    residualSeverity: 3,
  },
  {
    hazard: 'Obstructions in walkways',
    harm: 'People may trip over deliveries, cleaning equipment, luggage, or waste left in a route.',
    peopleAtRisk: ['Employees', 'Guests', 'Contractors'],
    standardControls: [
      'Keep corridors, stairs, and emergency routes clear.',
      'Store equipment and deliveries in designated areas.',
      'Include housekeeping checks in each shift.',
    ],
    initialLikelihood: 3,
    initialSeverity: 3,
    residualLikelihood: 1,
    residualSeverity: 3,
  },
  {
    hazard: 'Uneven or damaged surfaces',
    harm: 'Changes in level, loose flooring, or damaged paving may cause a trip and fall.',
    peopleAtRisk: ['Employees', 'Guests', 'Visitors'],
    standardControls: [
      'Inspect internal and external pedestrian routes regularly.',
      'Mark and isolate defects until a permanent repair is completed.',
      'Escalate defects through the property maintenance process.',
    ],
    initialLikelihood: 3,
    initialSeverity: 4,
    residualLikelihood: 2,
    residualSeverity: 3,
  },
  {
    hazard: 'Poor lighting',
    harm: 'People may not see steps, obstacles, or changes in floor level.',
    peopleAtRisk: ['Employees', 'Guests', 'Contractors', 'Visitors'],
    standardControls: [
      'Maintain suitable lighting in corridors, stairs, service areas, and external routes.',
      'Report failed lamps promptly and provide temporary lighting where needed.',
    ],
    initialLikelihood: 3,
    initialSeverity: 3,
    residualLikelihood: 1,
    residualSeverity: 3,
  },
  {
    hazard: 'Trailing cables',
    harm: 'A person may catch a foot on electrical or equipment cables crossing a route.',
    peopleAtRisk: ['Employees', 'Guests', 'Contractors'],
    standardControls: [
      'Route cables away from pedestrian areas.',
      'Use secured cable covers when crossing a route cannot be avoided.',
      'Disconnect and store temporary equipment after use.',
    ],
    initialLikelihood: 3,
    initialSeverity: 3,
    residualLikelihood: 1,
    residualSeverity: 3,
  },
]

export const SLIPS_TRIPS_TEMPLATE = {
  id: SLIPS_TRIPS_TEMPLATE_ID,
  tenantId: null,
  ownerKey: PLATFORM_RISK_TEMPLATE_OWNER,
  scope: 'platform' as const,
  title: 'Slips, Trips and Falls',
  category: 'general' as const,
  description:
    'A general hotel risk template for preventing slips, trips, and falls in guest, staff, service, and external areas.',
  version: '1.0',
  state: 'active' as const,
  areaGuidance:
    'Identify every pedestrian route covered, including entrances, corridors, stairs, kitchens, service areas, and external paths.',
  activityEquipmentGuidance:
    'Consider routine operations, cleaning, deliveries, events, maintenance, temporary equipment, and seasonal conditions.',
  hazards: SLIPS_TRIPS_HAZARDS,
  peopleAtRiskGuidance: [
    'Employees',
    'Guests',
    'Contractors',
    'Visitors',
    'People with limited mobility or impaired vision',
  ],
  standardControls: [
    'Inspect routes at suitable intervals and record or escalate defects.',
    'Keep routes clear, adequately lit, and in sound condition.',
    'Respond promptly to spills, contamination, and changing weather conditions.',
    'Brief teams on reporting hazards and maintaining safe routes.',
  ],
  furtherActionGuidance:
    'Create a corrective action for any control or repair that cannot be completed immediately, with a named owner, priority, due date, evidence, and verification.',
  initialRiskGuidance:
    'Score the credible risk before the listed controls are applied, using the central 1–5 likelihood and severity scale.',
  residualRiskGuidance:
    'Score the remaining risk after controls. Add further action where the remaining risk is not acceptable.',
  reviewGuidance:
    'Review after an incident or near miss, after significant layout or operational change, when controls fail, and at the property review interval.',
}

export function slipsTripsTemplateSnapshot(): AdoptedRiskTemplateSnapshot {
  return structuredClone({
    templateId: SLIPS_TRIPS_TEMPLATE.id,
    version: SLIPS_TRIPS_TEMPLATE.version,
    title: SLIPS_TRIPS_TEMPLATE.title,
    category: SLIPS_TRIPS_TEMPLATE.category,
    description: SLIPS_TRIPS_TEMPLATE.description,
    areaGuidance: SLIPS_TRIPS_TEMPLATE.areaGuidance,
    activityEquipmentGuidance: SLIPS_TRIPS_TEMPLATE.activityEquipmentGuidance,
    hazards: SLIPS_TRIPS_TEMPLATE.hazards,
    peopleAtRiskGuidance: SLIPS_TRIPS_TEMPLATE.peopleAtRiskGuidance,
    standardControls: SLIPS_TRIPS_TEMPLATE.standardControls,
    furtherActionGuidance: SLIPS_TRIPS_TEMPLATE.furtherActionGuidance,
    initialRiskGuidance: SLIPS_TRIPS_TEMPLATE.initialRiskGuidance,
    residualRiskGuidance: SLIPS_TRIPS_TEMPLATE.residualRiskGuidance,
    reviewGuidance: SLIPS_TRIPS_TEMPLATE.reviewGuidance,
  })
}
