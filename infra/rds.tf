# ─────────────────────────────────────────────────────────────────────────
# RDS PostgreSQL (#44B) — Phase 2 database, gated behind cost guardrails.
#
# DISABLED BY DEFAULT: every resource here is `count = var.enable_paid_resources
# ? 1 : 0`. With the flag off (the default), `terraform plan` adds nothing.
#
# When enabled: db.t3.micro, Single-AZ, 20 GB gp3, encrypted, in PRIVATE
# subnets only, NOT publicly accessible, reachable only via the db security
# group (which only allows the app tier). ~15-18 EUR/mo — see README.
#
# This file adds NO apply. No ECS / ALB / NAT / Secrets Manager here.
# ─────────────────────────────────────────────────────────────────────────

variable "db_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "gymtracker"
}

variable "db_username" {
  description = "Master username for the RDS PostgreSQL instance."
  type        = string
  default     = "gymadmin"
}

variable "db_password" {
  description = "Master password for RDS. Provide at apply time via tfvars/env — NEVER commit. Only needed when enable_paid_resources = true."
  type        = string
  default     = ""
  sensitive   = true
}

variable "db_instance_class" {
  description = "RDS instance class (smallest sensible default)."
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB (gp3 minimum is 20)."
  type        = number
  default     = 20
}

locals {
  rds_enabled = var.enable_paid_resources ? 1 : 0
}

resource "aws_db_subnet_group" "main" {
  count = local.rds_enabled

  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}

resource "aws_db_instance" "postgres" {
  count = local.rds_enabled

  identifier     = "${var.project_name}-postgres"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage = var.db_allocated_storage
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.main[0].name
  vpc_security_group_ids = [aws_security_group.db.id]

  multi_az            = false # Single-AZ (cost)
  publicly_accessible = false # private subnets only

  backup_retention_period = 1
  skip_final_snapshot     = true
  deletion_protection     = false

  tags = {
    Name = "${var.project_name}-postgres"
  }

  lifecycle {
    precondition {
      condition     = !var.enable_paid_resources || length(var.db_password) >= 8
      error_message = "Set db_password (>= 8 chars) via tfvars/env before enabling enable_paid_resources."
    }
  }
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint host (empty unless enable_paid_resources = true)."
  value       = try(aws_db_instance.postgres[0].address, "")
}

output "rds_port" {
  description = "RDS PostgreSQL port (empty unless enable_paid_resources = true)."
  value       = try(aws_db_instance.postgres[0].port, null)
}
