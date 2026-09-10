# ─────────────────────────────────────────────────────────────────────────
# ECS Fargate MVP — backend + frontend services behind the ALB.
#
# GATED: every resource is `count = local.fargate_enabled`. Off by default.
# Requires enable_paid_resources = true as well (for RDS).
#
# NO NAT GATEWAY: tasks run in PUBLIC subnets with assign_public_ip = true,
# so they can pull images from ECR and reach the Gemini API without a NAT
# (~32 EUR/mo saved). RDS stays private (db SG only allows the app SG).
#
# Apply sequence (see README/runbook):
#   1. terraform apply  → cluster, ALB, RDS, ECR, task defs, services
#   2. read `alb_dns_name` output
#   3. build+push backend image to ECR (linux/amd64)
#   4. build frontend image with NEXT_PUBLIC_API_BASE=http://<alb_dns>:8000, push
#   5. aws ecs update-service --force-new-deployment (both services)
# ─────────────────────────────────────────────────────────────────────────

variable "enable_fargate" {
  description = "Master switch for the ECS Fargate + ALB MVP. Off by default (cost). Set with enable_paid_resources = true."
  type        = bool
  default     = false
}

variable "backend_image_tag" {
  description = "ECR image tag for the backend container."
  type        = string
  default     = "latest"
}

variable "frontend_image_tag" {
  description = "ECR image tag for the frontend container."
  type        = string
  default     = "latest"
}

variable "fargate_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "fargate_memory" {
  description = "Fargate task memory in MiB (512 valid with 256 CPU)."
  type        = number
  default     = 512
}

variable "gemini_api_key" {
  description = "GEMINI_API_KEY for the backend AI coach. Provide via tfvars/env — never commit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_secret_key" {
  description = "JWT_SECRET_KEY for the backend. Provide via tfvars/env — never commit."
  type        = string
  default     = ""
  sensitive   = true
}

variable "app_timezone" {
  description = "APP_TIMEZONE for the backend."
  type        = string
  default     = "Europe/Berlin"
}

locals {
  fargate_enabled = var.enable_fargate ? 1 : 0

  backend_image  = "${aws_ecr_repository.app["backend"].repository_url}:${var.backend_image_tag}"
  frontend_image = "${aws_ecr_repository.app["frontend"].repository_url}:${var.frontend_image_tag}"

  alb_dns      = try(aws_lb.main[0].dns_name, "")
  database_url = try("postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.postgres[0].address}:5432/${var.db_name}", "")
}

resource "aws_ecs_cluster" "main" {
  count = local.fargate_enabled
  name  = "${var.project_name}-cluster"

  tags = { Name = "${var.project_name}-cluster" }
}

resource "aws_ecs_task_definition" "backend" {
  count                    = local.fargate_enabled
  family                   = "${var.project_name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  execution_role_arn       = aws_iam_role.ecs_execution[0].arn

  container_definitions = jsonencode([{
    name         = "backend"
    image        = local.backend_image
    essential    = true
    portMappings = [{ containerPort = 8000, protocol = "tcp" }]
    environment = [
      { name = "DATABASE_URL", value = local.database_url },
      { name = "GEMINI_API_KEY", value = var.gemini_api_key },
      { name = "JWT_SECRET_KEY", value = var.jwt_secret_key },
      { name = "APP_TIMEZONE", value = var.app_timezone },
      { name = "ALLOWED_ORIGINS", value = "http://${local.alb_dns}" },
      { name = "CHROMA_EMBED_MODE", value = "hash" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.backend[0].name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "backend"
      }
    }
  }])
}

resource "aws_ecs_task_definition" "frontend" {
  count                    = local.fargate_enabled
  family                   = "${var.project_name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.fargate_cpu
  memory                   = var.fargate_memory
  execution_role_arn       = aws_iam_role.ecs_execution[0].arn

  container_definitions = jsonencode([{
    name         = "frontend"
    image        = local.frontend_image
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    # NOTE: NEXT_PUBLIC_API_BASE is baked at BUILD time for Next.js. Set it when
    # building the frontend image (step 4). This runtime value is a fallback only.
    environment = [
      { name = "NEXT_PUBLIC_API_BASE", value = "http://${local.alb_dns}:8000" },
      { name = "NEXT_TELEMETRY_DISABLED", value = "1" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.frontend[0].name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "frontend"
      }
    }
  }])
}

resource "aws_ecs_service" "backend" {
  count           = local.fargate_enabled
  name            = "${var.project_name}-backend"
  cluster         = aws_ecs_cluster.main[0].id
  task_definition = aws_ecs_task_definition.backend[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true # no NAT → public IP for ECR pull + Gemini API
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend[0].arn
    container_name   = "backend"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.backend]
}

resource "aws_ecs_service" "frontend" {
  count           = local.fargate_enabled
  name            = "${var.project_name}-frontend"
  cluster         = aws_ecs_cluster.main[0].id
  task_definition = aws_ecs_task_definition.frontend[0].arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend[0].arn
    container_name   = "frontend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.frontend]
}

output "ecs_cluster_name" {
  description = "ECS cluster name (empty unless enable_fargate = true)."
  value       = try(aws_ecs_cluster.main[0].name, "")
}

output "app_url" {
  description = "Frontend URL once deployed."
  value       = local.fargate_enabled == 1 ? "http://${local.alb_dns}" : ""
}
