# ─────────────────────────────────────────────────────────────────────────
# Application Load Balancer for the Fargate MVP (gated behind enable_fargate).
#   :80   → frontend target group (Next.js, container port 3000)
#   :8000 → backend  target group (FastAPI, container port 8000)
# The ALB security group allows 80/443/8000 inline (see security_groups.tf).
# ─────────────────────────────────────────────────────────────────────────

resource "aws_lb" "main" {
  count              = local.fargate_enabled
  name               = "${var.project_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  access_logs {
    bucket  = aws_s3_bucket.alb_logs[0].bucket
    prefix  = "alb"
    enabled = true
  }

  # The bucket policy must exist before the ALB validates write access.
  depends_on = [aws_s3_bucket_policy.alb_logs]

  tags = { Name = "${var.project_name}-alb" }
}

resource "aws_lb_target_group" "frontend" {
  count       = local.fargate_enabled
  name        = "${var.project_name}-fe-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip" # required for Fargate (awsvpc)

  health_check {
    path                = "/"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }

  tags = { Name = "${var.project_name}-fe-tg" }
}

resource "aws_lb_target_group" "backend" {
  count       = local.fargate_enabled
  name        = "${var.project_name}-be-tg"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/" # FastAPI root returns 200 {"message": "Welcome", ...}
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 5
  }

  tags = { Name = "${var.project_name}-be-tg" }
}

resource "aws_lb_listener" "frontend" {
  count             = local.fargate_enabled
  load_balancer_arn = aws_lb.main[0].arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend[0].arn
  }
}

resource "aws_lb_listener" "backend" {
  count             = local.fargate_enabled
  load_balancer_arn = aws_lb.main[0].arn
  port              = 8000
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend[0].arn
  }
}

output "alb_dns_name" {
  description = "ALB DNS. Frontend: http://<dns>  ·  Backend: http://<dns>:8000. Use http://<dns>:8000 as NEXT_PUBLIC_API_BASE when building the frontend image."
  value       = try(aws_lb.main[0].dns_name, "")
}
