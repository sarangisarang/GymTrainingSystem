# ─────────────────────────────────────────────────────────────────────────
# Cost guardrails.
#
# Feature flags that keep every PAID resource OFF by default. No resource
# references these yet — Phase 1 is entirely free. Later phases (RDS, ECS,
# ALB, NAT) MUST gate their billable resources behind these flags via
# `count = var.enable_* ? 1 : 0`, so nothing costly is ever created without
# an explicit, deliberate opt-in.
#
# There is intentionally NO `terraform apply` in this project phase.
# ─────────────────────────────────────────────────────────────────────────

variable "monthly_budget_eur" {
  description = "Target monthly AWS spend ceiling for this project, in EUR. Used for documentation and (later) AWS Budgets."
  type        = number
  default     = 30

  validation {
    condition     = var.monthly_budget_eur > 0
    error_message = "monthly_budget_eur must be a positive number."
  }
}

variable "enable_paid_resources" {
  description = "Master switch. Must be true before ANY billable resource (RDS/ECS/ALB/NAT) is created. Off by default."
  type        = bool
  default     = false
}

variable "enable_nat_gateway" {
  description = "Create a NAT Gateway (~32 EUR/mo + data). Off by default; only enable with explicit cost approval."
  type        = bool
  default     = false
}

variable "enable_alb" {
  description = "Create an Application Load Balancer (~18-20 EUR/mo + LCU). Off by default; approval required before enabling."
  type        = bool
  default     = false
}

variable "enable_documentdb" {
  description = "Create AWS DocumentDB. Permanently disabled for this project — MongoDB is deferred and, if ever needed, hosted externally on MongoDB Atlas (never DocumentDB)."
  type        = bool
  default     = false

  validation {
    condition     = var.enable_documentdb == false
    error_message = "DocumentDB is out of scope (budget). MongoDB is deferred; if ever needed use external MongoDB Atlas. Keep enable_documentdb = false."
  }
}

variable "budget_alert_email" {
  description = "E-Mail für AWS-Budget-Benachrichtigungen (nur bei enable_fargate genutzt)."
  type        = string
  default     = ""
}

# Echter AWS-Budget-Alarm (kostenlos) — warnt bei 80 % (Ist-Kosten) und 100 %
# (Prognose) des Monatslimits. So bleibt das Deployment kostenkontrolliert.
resource "aws_budgets_budget" "monthly" {
  count        = local.fargate_enabled
  name         = "${var.project_name}-monthly"
  budget_type  = "COST"
  limit_amount = "20"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
