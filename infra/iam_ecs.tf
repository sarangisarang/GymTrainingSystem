# ─────────────────────────────────────────────────────────────────────────
# IAM + CloudWatch for the ECS Fargate MVP (gated behind enable_fargate).
# Local/uncommitted MVP scaffolding — not part of the Phase-1 foundation.
# ─────────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_assume" {
  count = local.fargate_enabled

  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: lets Fargate pull images from ECR and write logs to CW.
resource "aws_iam_role" "ecs_execution" {
  count              = local.fargate_enabled
  name               = "${var.project_name}-ecs-exec-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume[0].json

  tags = { Name = "${var.project_name}-ecs-exec-role" }
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  count      = local.fargate_enabled
  role       = aws_iam_role.ecs_execution[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_cloudwatch_log_group" "backend" {
  count             = local.fargate_enabled
  name              = "/ecs/${var.project_name}-backend"
  retention_in_days = 7

  tags = { Name = "${var.project_name}-backend-logs" }
}

resource "aws_cloudwatch_log_group" "frontend" {
  count             = local.fargate_enabled
  name              = "/ecs/${var.project_name}-frontend"
  retention_in_days = 7

  tags = { Name = "${var.project_name}-frontend-logs" }
}
