/**
 * Ground Truth Label Evaluator
 * Handles flexible dataset schemas and ground truth label extraction for quantitative analysis
 * Supports imbalanced datasets with class balance metrics
 */

import type { GroundTruthMapping } from "@/types/benchmarking";
import {
  classBalanceMetrics,
  stratifiedKFold,
  kFold,
  cohensD,
  mannWhitneyU,
  welchTTest,
  bonferroniAdjustedPValue,
  type KFoldSplit,
} from "./statistical-analysis";

export interface DataRow {
  [key: string]: any;
}

export interface EvaluationResult {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  f1_score: number;
  specificity: number;
  fpr: number;
  fnr: number;
  accuracy: number;
}

export interface CrossValidationResult {
  foldResults: EvaluationResult[];
  meanPrecision: number;
  meanRecall: number;
  meanF1Score: number;
  meanAccuracy: number;
  stdPrecision: number;
  stdRecall: number;
  stdF1Score: number;
  stdAccuracy: number;
}

const COMMON_LABEL_FIELDS = [
  "is_fraud",
  "isFraud",
  "fraud",
  "fraud_label",
  "fraudLabel",
  "ground_truth",
  "groundTruth",
  "label",
  "target",
  "class",
  "outcome",
  "result",
  "actual",
  "actual_class",
  "actualClass",
  "y",
  "is_fraud_flag",
  "fraud_flag",
];

export function autoDetectGroundTruthColumn(
  data: DataRow[],
): { fieldName: string; confidence: number } | null {
  if (!data || data.length === 0) return null;

  const firstRow = data[0];
  const keys = Object.keys(firstRow);

  for (const field of COMMON_LABEL_FIELDS) {
    if (field in firstRow) {
      return { fieldName: field, confidence: 0.95 };
    }
  }

  for (const field of keys) {
    const values = new Set();
    for (let i = 0; i < Math.min(100, data.length); i++) {
      const val = data[i][field];
      if (val !== null && val !== undefined) {
        values.add(String(val).toLowerCase());
      }
    }

    if (values.size === 2) {
      const valArray = Array.from(values) as string[];
      const isBinary =
        (valArray.includes("true") && valArray.includes("false")) ||
        (valArray.includes("0") && valArray.includes("1")) ||
        (valArray.includes("fraud") && valArray.includes("legit")) ||
        (valArray.includes("yes") && valArray.includes("no"));

      if (isBinary) {
        return { fieldName: field, confidence: 0.7 };
      }
    }
  }

  return null;
}

export function autoDetectClassValues(
  data: DataRow[],
  fieldName: string,
): {
  positiveValue: string | number | boolean;
  negativeValue: string | number | boolean;
} | null {
  if (!data || data.length === 0) return null;

  const values = new Set<string | number | boolean>();
  for (const row of data) {
    if (row[fieldName] !== null && row[fieldName] !== undefined) {
      values.add(row[fieldName]);
    }
  }

  if (values.size !== 2) return null;

  const [val1, val2] = Array.from(values);
  const str1 = String(val1).toLowerCase();

  const fraudKeywords = ["fraud", "true", "1", "positive", "bad", "yes", "high_risk"];
  const legitKeywords = ["legit", "legitimate", "false", "0", "negative", "good", "no", "low_risk"];

  const val1IsFraud = fraudKeywords.some((kw) => str1.includes(kw));
  const val1IsLegit = legitKeywords.some((kw) => str1.includes(kw));

  if (val1IsFraud && !val1IsLegit) {
    return { positiveValue: val1, negativeValue: val2 };
  }
  if (val1IsLegit && !val1IsFraud) {
    return { positiveValue: val2, negativeValue: val1 };
  }

  if (val1 === 1 || val1 === "1") {
    return { positiveValue: val1, negativeValue: val2 };
  }
  if (val2 === 1 || val2 === "1") {
    return { positiveValue: val2, negativeValue: val1 };
  }

  return { positiveValue: val1, negativeValue: val2 };
}

export function extractGroundTruthLabels(
  data: DataRow[],
  mapping: GroundTruthMapping,
): (number | string | boolean)[] {
  return data.map((row) => {
    const value = row[mapping.fieldName];
    if (value === null || value === undefined) {
      throw new Error(
        `Missing ground truth value in field "${mapping.fieldName}" for row`,
      );
    }
    return value;
  });
}

export function calculateConfusionMatrix(
  predictions: (number | string | boolean)[],
  groundTruth: (number | string | boolean)[],
  mapping: GroundTruthMapping,
): { tp: number; fp: number; fn: number; tn: number } {
  if (predictions.length !== groundTruth.length) {
    throw new Error("Predictions and ground truth must have the same length");
  }

  let tp = 0, fp = 0, fn = 0, tn = 0;

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    const truth = groundTruth[i];
    const predIsPositive = pred === mapping.positiveValue;
    const truthIsPositive = truth === mapping.positiveValue;

    if (predIsPositive && truthIsPositive) tp++;
    else if (predIsPositive && !truthIsPositive) fp++;
    else if (!predIsPositive && truthIsPositive) fn++;
    else tn++;
  }

  return { tp, fp, fn, tn };
}

export function calculateMetrics(cm: {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}): EvaluationResult {
  const total = cm.tp + cm.fp + cm.fn + cm.tn;
  const precision = cm.tp / (cm.tp + cm.fp || 1);
  const recall = cm.tp / (cm.tp + cm.fn || 1);
  const f1_score = (2 * precision * recall) / (precision + recall || 1);
  const accuracy = (cm.tp + cm.tn) / (total || 1);
  const specificity = cm.tn / (cm.tn + cm.fp || 1);
  const fpr = cm.fp / (cm.fp + cm.tn || 1);
  const fnr = cm.fn / (cm.fn + cm.tp || 1);

  return { ...cm, precision, recall, f1_score, specificity, fpr, fnr, accuracy };
}

export function evaluateWithCrossValidation(
  data: DataRow[],
  predictions: (number | string | boolean)[],
  groundTruth: (number | string | boolean)[],
  mapping: GroundTruthMapping,
  k: number = 5,
  stratified: boolean = true,
): CrossValidationResult {
  if (data.length < k) {
    throw new Error(`Dataset size (${data.length}) must be at least k (${k})`);
  }

  const splits: KFoldSplit[] = stratified
    ? stratifiedKFold(groundTruth, k)
    : kFold(data.length, k);

  const foldResults: EvaluationResult[] = [];

  for (const split of splits) {
    const testPreds = split.testIndices.map((i) => predictions[i]);
    const testTruth = split.testIndices.map((i) => groundTruth[i]);
    const cm = calculateConfusionMatrix(testPreds, testTruth, mapping);
    foldResults.push(calculateMetrics(cm));
  }

  const precisions = foldResults.map((r) => r.precision);
  const recalls = foldResults.map((r) => r.recall);
  const f1Scores = foldResults.map((r) => r.f1_score);
  const accuracies = foldResults.map((r) => r.accuracy);

  const meanPrecision = precisions.reduce((a, b) => a + b, 0) / k;
  const meanRecall = recalls.reduce((a, b) => a + b, 0) / k;
  const meanF1Score = f1Scores.reduce((a, b) => a + b, 0) / k;
  const meanAccuracy = accuracies.reduce((a, b) => a + b, 0) / k;

  const stdPrecision = Math.sqrt(
    precisions.reduce((sum, v) => sum + (v - meanPrecision) ** 2, 0) / (k - 1 || 1),
  );
  const stdRecall = Math.sqrt(
    recalls.reduce((sum, v) => sum + (v - meanRecall) ** 2, 0) / (k - 1 || 1),
  );
  const stdF1Score = Math.sqrt(
    f1Scores.reduce((sum, v) => sum + (v - meanF1Score) ** 2, 0) / (k - 1 || 1),
  );
  const stdAccuracy = Math.sqrt(
    accuracies.reduce((sum, v) => sum + (v - meanAccuracy) ** 2, 0) / (k - 1 || 1),
  );

  return {
    foldResults,
    meanPrecision,
    meanRecall,
    meanF1Score,
    meanAccuracy,
    stdPrecision,
    stdRecall,
    stdF1Score,
    stdAccuracy,
  };
}

export function compareMetricsAcrossDatasets(
  dataset1Metrics: EvaluationResult[],
  dataset2Metrics: EvaluationResult[],
  alpha: number = 0.05,
): {
  precisionTest: { u: number; pValue: number; significant: boolean };
  recallTest: { u: number; pValue: number; significant: boolean };
  f1ScoreTest: { u: number; pValue: number; significant: boolean };
  bonferroniCorrectedAlpha: number;
} {
  const numTests = 3;
  const bonferroniAlpha = bonferroniAdjustedPValue(alpha, numTests);

  const precisionTest = mannWhitneyU(
    dataset1Metrics.map((m) => m.precision),
    dataset2Metrics.map((m) => m.precision),
  );
  const recallTest = mannWhitneyU(
    dataset1Metrics.map((m) => m.recall),
    dataset2Metrics.map((m) => m.recall),
  );
  const f1ScoreTest = mannWhitneyU(
    dataset1Metrics.map((m) => m.f1_score),
    dataset2Metrics.map((m) => m.f1_score),
  );

  return {
    precisionTest: {
      u: precisionTest.u,
      pValue: precisionTest.pValue,
      significant: precisionTest.pValue < bonferroniAlpha,
    },
    recallTest: {
      u: recallTest.u,
      pValue: recallTest.pValue,
      significant: recallTest.pValue < bonferroniAlpha,
    },
    f1ScoreTest: {
      u: f1ScoreTest.u,
      pValue: f1ScoreTest.pValue,
      significant: f1ScoreTest.pValue < bonferroniAlpha,
    },
    bonferroniCorrectedAlpha: bonferroniAlpha,
  };
}

export function validateDataset(
  data: DataRow[],
  mapping: GroundTruthMapping,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || data.length === 0) {
    errors.push("Dataset is empty");
    return { valid: false, errors };
  }

  if (!(mapping.fieldName in data[0])) {
    errors.push(`Ground truth field "${mapping.fieldName}" not found in dataset`);
  }

  for (let i = 0; i < data.length; i++) {
    const value = data[i][mapping.fieldName];
    if (value === null || value === undefined) {
      errors.push(`Row ${i}: Ground truth value is missing`);
    }
    if (value !== mapping.positiveValue && value !== mapping.negativeValue) {
      errors.push(
        `Row ${i}: Invalid ground truth value "${value}". Expected "${mapping.positiveValue}" or "${mapping.negativeValue}"`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

export type { KFoldSplit };
export { classBalanceMetrics, cohensD, welchTTest };
