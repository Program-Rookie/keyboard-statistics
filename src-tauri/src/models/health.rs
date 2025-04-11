use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthAssessment {
    pub daily_usage_hours: f64,
    pub average_kpm: f64,
    pub risk_level: RiskLevel,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

impl HealthAssessment {
    pub fn new(daily_usage_hours: f64, average_kpm: f64) -> Self {
        let (risk_level, recommendations) = Self::assess_risk(daily_usage_hours, average_kpm);
        Self {
            daily_usage_hours,
            average_kpm,
            risk_level,
            recommendations,
        }
    }

    fn assess_risk(daily_usage_hours: f64, average_kpm: f64) -> (RiskLevel, Vec<String>) {
        let mut risk_level = RiskLevel::Low;
        let mut recommendations = Vec::new();

        if daily_usage_hours > 8.0 {
            risk_level = RiskLevel::High;
            recommendations.push("建议减少每日使用时间，每工作1小时休息10分钟".to_string());
        } else if daily_usage_hours > 6.0 {
            risk_level = RiskLevel::Medium;
            recommendations.push("建议适当增加休息时间".to_string());
        }

        if average_kpm > 300.0 {
            risk_level = RiskLevel::High;
            recommendations.push("打字速度过快，建议适当降低速度以减少疲劳".to_string());
        }

        (risk_level, recommendations)
    }
} 