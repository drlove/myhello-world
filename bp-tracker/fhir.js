export function createBPObservation({ id, systolic, diastolic, pulse, arm = 'left', position = 'sitting', notes, measuredAt }) {
  const armCodes = {
    left:  { code: '368208006', display: 'Left arm' },
    right: { code: '368209003', display: 'Right arm' },
  };
  const positionCodes = {
    sitting:  { code: '33586001',  display: 'Sitting position' },
    standing: { code: '10904000',  display: 'Orthostatic body position' },
    lying:    { code: '102538003', display: 'Recumbent body position' },
  };
  const obs = {
    resourceType: 'Observation',
    id,
    meta: { profile: ['http://hl7.org/fhir/StructureDefinition/bp'] },
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs', display: 'Vital Signs' }] }],
    code: { coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel with all children optional' }], text: 'Blood pressure' },
    effectiveDateTime: measuredAt,
    bodySite: { coding: [{ system: 'http://snomed.info/sct', code: armCodes[arm].code, display: armCodes[arm].display }] },
    method: { coding: [{ system: 'http://snomed.info/sct', code: positionCodes[position].code, display: positionCodes[position].display }] },
    component: [
      { code: { coding: [{ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' }], text: 'Systolic' }, valueQuantity: { value: systolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
      { code: { coding: [{ system: 'http://loinc.org', code: '8462-4', display: 'Diastolic blood pressure' }], text: 'Diastolic' }, valueQuantity: { value: diastolic, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' } },
    ],
  };
  if (pulse) obs.component.push({ code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }], text: 'Pulse' }, valueQuantity: { value: pulse, unit: 'beats/minute', system: 'http://unitsofmeasure.org', code: '/min' } });
  if (notes) obs.note = [{ text: notes }];
  return obs;
}

export function classifyBP(systolic, diastolic) {
  if (systolic >= 180 || diastolic >= 120) return { label: 'Hypertensive Crisis', cls: 'crisis' };
  if (systolic >= 140 || diastolic >= 90)  return { label: 'High — Stage 2',      cls: 'high2' };
  if (systolic >= 130 || diastolic >= 80)  return { label: 'High — Stage 1',      cls: 'high1' };
  if (systolic >= 120 && diastolic < 80)   return { label: 'Elevated',            cls: 'elevated' };
  return { label: 'Normal', cls: 'normal' };
}

export function fhirBundle(observations) {
  return { resourceType: 'Bundle', type: 'collection', total: observations.length, timestamp: new Date().toISOString(), entry: observations.map(resource => ({ resource })) };
}
