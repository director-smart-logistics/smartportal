import React from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/lib/context/ThemeContext";
import { useLocale } from "@/hooks/useLocale";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Target,
  DollarSign,
  Users,
  MessageSquare,
} from "lucide-react";
import {
  QuoteAISuggestions,
  CustomerAnalysis,
  DealPrediction,
} from "@/lib/hooks/queries/useQuotes";

interface AIInsightsPanelProps {
  suggestions?: QuoteAISuggestions | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  onApplyDiscount?: (discount: number) => void;
  className?: string;
}

export const AIInsightsPanel = React.memo(function AIInsightsPanel({
  suggestions,
  isLoading = false,
  onRefresh,
  onApplyDiscount,
  className = "",
}: AIInsightsPanelProps) {
  const { theme } = useTheme();
  const { t } = useLocale(["quotes"]);
  const isDark = theme === "dark";

  const getDealScoreColor = (score: number) => {
    if (score >= 70) return "text-green-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getDealScoreBg = (score: number) => {
    if (score >= 70) return "bg-green-500";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "premium":
        return <Target className="h-3 w-3 text-purple-500" />;
      case "standard":
        return <Users className="h-3 w-3 text-blue-500" />;
      default:
        return <Users className="h-3 w-3 text-gray-500" />;
    }
  };

  return (
    <Card
      className={`p-4 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white"} ${className}`}
      data-testid="ai-insights-panel"
      aria-label={t("accessibilityAiPanel")}
    >
      <div className="flex items-center justify-between mb-3">
        <h3
          className={`text-sm font-semibold flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}
        >
          <Sparkles className="h-4 w-4 text-yellow-500" aria-hidden />
          {t("aiTitle")}
        </h3>
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-7 w-7 p-0"
            aria-label={t("aiRefresh")}
          >
            {isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <Loader2
              className={`h-8 w-8 animate-spin mx-auto mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}
            />
            <p
              className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}
            >
              {t("aiLoading")}
            </p>
          </div>
        </div>
      ) : suggestions ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Deal Prediction */}
          {suggestions.dealPrediction && (
            <div data-testid="deal-prediction">
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}
                >
                  {t("aiDealLikelihood")}
                </span>
                <Badge
                  className={getDealScoreBg(
                    suggestions.dealPrediction.likelihood,
                  )}
                  aria-label={`${t("aiDealScore")}: ${suggestions.dealPrediction.likelihood}%`}
                >
                  {suggestions.dealPrediction.likelihood}%
                </Badge>
              </div>

              {/* Progress Bar */}
              <div
                className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2"
                role="progressbar"
                aria-valuenow={suggestions.dealPrediction.likelihood}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <motion.div
                  className={`h-2 rounded-full ${getDealScoreBg(suggestions.dealPrediction.likelihood)}`}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${suggestions.dealPrediction.likelihood}%`,
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>

              {/* Category Badge */}
              <div className="flex items-center gap-2 mb-2">
                {suggestions.dealPrediction.category === "very_likely" && (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                )}
                {suggestions.dealPrediction.category === "unlikely" && (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={`text-xs ${getDealScoreColor(suggestions.dealPrediction.likelihood)}`}
                >
                  {(() => {
                    const categoryMap: Record<string, string> = {
                      very_likely: "aiVeryLikely",
                      likely: "aiLikely",
                      uncertain: "aiUncertain",
                      unlikely: "aiUnlikely",
                    };
                    return t(
                      categoryMap[suggestions.dealPrediction.category] ||
                        "aiUncertain",
                    );
                  })()}
                </span>
                <span
                  className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}
                >
                  • {suggestions.dealPrediction.estimatedCloseTime}
                </span>
              </div>

              {/* Factors */}
              {suggestions.dealPrediction.factors && (
                <div
                  className={`space-y-1 text-[10px] ${isDark ? "text-gray-500" : "text-gray-500"}`}
                >
                  {suggestions.dealPrediction.factors.positive
                    ?.slice(0, 2)
                    .map((factor, i) => (
                      <div
                        key={`pos-${i}`}
                        className="flex items-center gap-1 text-green-600 dark:text-green-400"
                      >
                        <CheckCircle className="h-2.5 w-2.5" />
                        {factor}
                      </div>
                    ))}
                  {suggestions.dealPrediction.factors.negative
                    ?.slice(0, 2)
                    .map((factor, i) => (
                      <div
                        key={`neg-${i}`}
                        className="flex items-center gap-1 text-red-600 dark:text-red-400"
                      >
                        <AlertTriangle className="h-2.5 w-2.5" />
                        {factor}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          <Separator className={isDark ? "bg-gray-700" : ""} />

          {/* Customer Analysis */}
          {suggestions.customerAnalysis && (
            <div data-testid="customer-analysis">
              <span
                className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}
              >
                {t("aiCustomerAnalysis")}
              </span>
              <div
                className={`mt-2 p-2 rounded border ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {getTierIcon(suggestions.customerAnalysis.customerTier)}
                  <span
                    className={`text-xs font-medium ${isDark ? "text-white" : "text-gray-900"}`}
                  >
                    {(() => {
                      const tierMap: Record<string, string> = {
                        premium: "aiTierPremium",
                        standard: "aiTierStandard",
                        new: "aiTierNew",
                      };
                      return t(
                        tierMap[suggestions.customerAnalysis.customerTier] ||
                          "aiTierStandard",
                      );
                    })()}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {(() => {
                      const paymentMap: Record<string, string> = {
                        excellent: "aiExcellent",
                        good: "aiGood",
                        fair: "aiFair",
                        poor: "aiPoor",
                      };
                      return t(
                        paymentMap[
                          suggestions.customerAnalysis.paymentHistory
                        ] || "aiFair",
                      );
                    })()}
                  </Badge>
                </div>
                <div
                  className={`grid grid-cols-2 gap-2 text-[10px] ${isDark ? "text-gray-400" : "text-gray-600"}`}
                >
                  <div>
                    <span className="font-medium">{t("aiTotalOrders")}:</span>{" "}
                    {suggestions.customerAnalysis.totalOrders}
                  </div>
                  <div>
                    <span className="font-medium">{t("aiTotalSpent")}:</span> $
                    {suggestions.customerAnalysis.totalSpent.toFixed(0)}
                  </div>
                  <div>
                    <span className="font-medium">{t("aiAverageOrder")}:</span>{" "}
                    ${suggestions.customerAnalysis.averageOrderValue.toFixed(0)}
                  </div>
                </div>
                {suggestions.customerAnalysis.insights?.length > 0 && (
                  <div
                    className={`mt-2 pt-2 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}
                  >
                    {suggestions.customerAnalysis.insights
                      .slice(0, 2)
                      .map((insight, i) => (
                        <p
                          key={i}
                          className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-500"}`}
                        >
                          • {insight}
                        </p>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Discount Recommendation */}
          {suggestions.discountRecommendation && (
            <div data-testid="discount-recommendation">
              <span
                className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}
              >
                {t("aiDiscountRecommendation")}
              </span>
              <div
                className={`mt-2 p-2 rounded border ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-3 w-3 text-green-500" />
                    <span
                      className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}
                    >
                      {suggestions.discountRecommendation.suggestedDiscount}%
                    </span>
                    <span
                      className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-500"}`}
                    >
                      (max: {suggestions.discountRecommendation.maxDiscount}%)
                    </span>
                  </div>
                  {onApplyDiscount && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onApplyDiscount(
                          suggestions.discountRecommendation!.suggestedDiscount,
                        )
                      }
                      className="h-6 text-[10px]"
                      data-testid="apply-discount-btn"
                    >
                      Apply
                    </Button>
                  )}
                </div>
                <p
                  className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-500"}`}
                >
                  {suggestions.discountRecommendation.reasoning}
                </p>
              </div>
            </div>
          )}

          {/* Sales Insights */}
          {suggestions.salesInsights && (
            <div data-testid="sales-insights">
              <span
                className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}
              >
                {t("aiSalesInsights")}
              </span>

              {/* Talking Points */}
              {suggestions.salesInsights.talkingPoints?.length > 0 && (
                <div
                  className={`mt-2 p-2 rounded border ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
                >
                  <span
                    className={`text-[10px] font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}
                  >
                    {t("aiTalkingPoints")}
                  </span>
                  <ul
                    className={`mt-1 space-y-0.5 text-[10px] ${isDark ? "text-gray-500" : "text-gray-500"}`}
                  >
                    {suggestions.salesInsights.talkingPoints
                      .slice(0, 3)
                      .map((point, i) => (
                        <li key={i}>• {point}</li>
                      ))}
                  </ul>
                </div>
              )}

              {/* Objection Handlers */}
              {suggestions.salesInsights.objectionHandlers?.length > 0 && (
                <div
                  className={`mt-2 p-2 rounded border ${isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"}`}
                >
                  <span
                    className={`text-[10px] font-medium flex items-center gap-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}
                  >
                    <MessageSquare className="h-2.5 w-2.5" />
                    {t("aiObjectionHandlers")}
                  </span>
                  {suggestions.salesInsights.objectionHandlers
                    .slice(0, 2)
                    .map((handler, i) => (
                      <div
                        key={i}
                        className={`mt-1 text-[10px] ${isDark ? "text-gray-500" : "text-gray-500"}`}
                      >
                        <p className="font-medium">"{handler.objection}"</p>
                        <p className="italic ml-2">→ {handler.response}</p>
                      </div>
                    ))}
                </div>
              )}

              {/* Urgency Factors */}
              {suggestions.salesInsights.urgencyFactors?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {suggestions.salesInsights.urgencyFactors
                    .slice(0, 3)
                    .map((factor, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="text-[10px] bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800"
                      >
                        ⚡ {factor}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {suggestions.dealPrediction?.recommendations?.length > 0 && (
            <div data-testid="ai-recommendations">
              <span
                className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}
              >
                {t("aiRecommendations")}
              </span>
              <ul
                className={`mt-1 space-y-1 text-[10px] ${isDark ? "text-gray-500" : "text-gray-500"}`}
              >
                {suggestions.dealPrediction.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <span className="text-blue-500">→</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Generated timestamp */}
          {suggestions.generatedAt && (
            <p
              className={`text-[9px] text-center ${isDark ? "text-gray-600" : "text-gray-400"}`}
            >
              Generated: {new Date(suggestions.generatedAt).toLocaleString()}
            </p>
          )}
        </motion.div>
      ) : (
        <div
          className={`text-center py-6 ${isDark ? "text-gray-500" : "text-gray-400"}`}
        >
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" aria-hidden />
          <p className="text-xs mb-2">{t("aiNoSuggestions")}</p>
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="gap-1"
            >
              <Sparkles className="h-3 w-3" />
              {t("aiGenerateSuggestions")}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
});

export default AIInsightsPanel;
