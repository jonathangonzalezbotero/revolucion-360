
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "access_grants": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"granted_by": string | null,"group_id": string | null,"id": string,"invite_code": string | null,"kind": string,"revoked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"granted_by"?: string | null,"group_id"?: string | null,"id"?: string,"invite_code"?: string | null,"kind"?: string,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"granted_by"?: string | null,"group_id"?: string | null,"id"?: string,"invite_code"?: string | null,"kind"?: string,"revoked_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_grants_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"accounts": {
                  Row: {
                    "archived_at": string | null,"balance_cents": number,"balance_date": string,"created_at": string,"id": string,"in_forecast": boolean,"in_networth": boolean,"institution": string,"is_emergency_fund": boolean,"kind": string,"name": string,"sort": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"balance_cents"?: number,"balance_date"?: string,"created_at"?: string,"id"?: string,"in_forecast"?: boolean,"in_networth"?: boolean,"institution"?: string,"is_emergency_fund"?: boolean,"kind": string,"name": string,"sort"?: number,"user_id": string
                  }
                  Update: {
                    "archived_at"?: string | null,"balance_cents"?: number,"balance_date"?: string,"created_at"?: string,"id"?: string,"in_forecast"?: boolean,"in_networth"?: boolean,"institution"?: string,"is_emergency_fund"?: boolean,"kind"?: string,"name"?: string,"sort"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"activity_weeks": {
                  Row: {
                    "user_id": string,"week_start": string,"wildcard": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "user_id": string,"week_start": string,"wildcard"?: boolean
                  }
                  Update: {
                    "user_id"?: string,"week_start"?: string,"wildcard"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"admin_audit": {
                  Row: {
                    "action": string,"admin_id": string | null,"at": string,"detail": NonNullable<Json>,"id": string,"target_user": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"admin_id"?: string | null,"at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_user"?: string | null
                  }
                  Update: {
                    "action"?: string,"admin_id"?: string | null,"at"?: string,"detail"?: NonNullable<Json>,"id"?: string,"target_user"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"admin_notes": {
                  Row: {
                    "admin_id": string | null,"body": string,"created_at": string,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"user_id": string
                  }
                  Update: {
                    "admin_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"app_config": {
                  Row: {
                    "key": string,"updated_at": string,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"categories": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"is_basic": boolean,"kind": string,"name": string,"original_name": string | null,"sort": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"is_basic"?: boolean,"kind": string,"name": string,"original_name"?: string | null,"sort"?: number,"user_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"is_basic"?: boolean,"kind"?: string,"name"?: string,"original_name"?: string | null,"sort"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"category_rules": {
                  Row: {
                    "category_id": string | null,"created_at": string,"id": string,"pattern": string,"plan_line_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id"?: string | null,"created_at"?: string,"id"?: string,"pattern": string,"plan_line_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "category_id"?: string | null,"created_at"?: string,"id"?: string,"pattern"?: string,"plan_line_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_rules_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "category_rules_plan_line_id_fkey"
      columns: ["plan_line_id"]
isOneToOne: false
      referencedRelation: "plan_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"company_entries": {
                  Row: {
                    "amount_cents": number,"class": string,"created_at": string,"date": string,"id": string,"kind": string,"note": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"class"?: string,"created_at"?: string,"date": string,"id"?: string,"kind": string,"note"?: string,"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"class"?: string,"created_at"?: string,"date"?: string,"id"?: string,"kind"?: string,"note"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"countries": {
                  Row: {
                    "benchmarks": NonNullable<Json>,"categories": NonNullable<Json>,"code": string,"currency": string,"enabled": boolean,"examples": NonNullable<Json>,"locale_number": string,"name": string,"pay_frequency": string,"sort": number,"terms": NonNullable<Json>,"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "benchmarks"?: NonNullable<Json>,"categories"?: NonNullable<Json>,"code": string,"currency": string,"enabled"?: boolean,"examples"?: NonNullable<Json>,"locale_number"?: string,"name": string,"pay_frequency"?: string,"sort"?: number,"terms"?: NonNullable<Json>,"timezone": string
                  }
                  Update: {
                    "benchmarks"?: NonNullable<Json>,"categories"?: NonNullable<Json>,"code"?: string,"currency"?: string,"enabled"?: boolean,"examples"?: NonNullable<Json>,"locale_number"?: string,"name"?: string,"pay_frequency"?: string,"sort"?: number,"terms"?: NonNullable<Json>,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"coupons": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"duration_months": number | null,"id": string,"max_redemptions": number | null,"percent_off": number,"redemptions": number,"stripe_coupon_id": string | null,"stripe_promo_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"duration_months"?: number | null,"id"?: string,"max_redemptions"?: number | null,"percent_off": number,"redemptions"?: number,"stripe_coupon_id"?: string | null,"stripe_promo_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"duration_months"?: number | null,"id"?: string,"max_redemptions"?: number | null,"percent_off"?: number,"redemptions"?: number,"stripe_coupon_id"?: string | null,"stripe_promo_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"course_modules": {
                  Row: {
                    "course_id": string,"id": string,"sort": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"id"?: string,"sort"?: number,"title": string
                  }
                  Update: {
                    "course_id"?: string,"id"?: string,"sort"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "course_modules_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    }
                  ]
                },"courses": {
                  Row: {
                    "cover_url": string,"description": string,"id": string,"number": number,"priority": string | null,"publish_at": string | null,"slug": string,"sort": number,"stage": string,"status": string,"tier": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cover_url"?: string,"description"?: string,"id"?: string,"number": number,"priority"?: string | null,"publish_at"?: string | null,"slug": string,"sort"?: number,"stage": string,"status"?: string,"tier"?: string,"title": string
                  }
                  Update: {
                    "cover_url"?: string,"description"?: string,"id"?: string,"number"?: number,"priority"?: string | null,"publish_at"?: string | null,"slug"?: string,"sort"?: number,"stage"?: string,"status"?: string,"tier"?: string,"title"?: string
                  }
                  Relationships: [
                    
                  ]
                },"csv_formats": {
                  Row: {
                    "bank": string,"id": string,"mapping": NonNullable<Json>,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bank": string,"id"?: string,"mapping": NonNullable<Json>,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "bank"?: string,"id"?: string,"mapping"?: NonNullable<Json>,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"csv_imports": {
                  Row: {
                    "account_id": string | null,"balance_diff_cents": number | null,"bank": string,"created_at": string,"id": string,"rows_duplicate": number,"rows_imported": number,"rows_total": number,"rows_transfer": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"balance_diff_cents"?: number | null,"bank"?: string,"created_at"?: string,"id"?: string,"rows_duplicate"?: number,"rows_imported"?: number,"rows_total"?: number,"rows_transfer"?: number,"user_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"balance_diff_cents"?: number | null,"bank"?: string,"created_at"?: string,"id"?: string,"rows_duplicate"?: number,"rows_imported"?: number,"rows_total"?: number,"rows_transfer"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "csv_imports_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"debt_payments": {
                  Row: {
                    "amount_cents": number,"created_at": string,"date": string,"debt_id": string,"id": string,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"date": string,"debt_id": string,"id"?: string,"kind"?: string,"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"date"?: string,"debt_id"?: string,"id"?: string,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "debt_payments_debt_id_fkey"
      columns: ["debt_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id"]
    }
                  ]
                },"debts": {
                  Row: {
                    "balance_cents": number,"closed_at": string | null,"created_at": string,"id": string,"kind": string,"name": string,"next_due": string | null,"payment_cents": number,"payment_frequency": string,"rate_bps": number,"schedule": Json | null,"start_balance_cents": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "balance_cents"?: number,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"name": string,"next_due"?: string | null,"payment_cents"?: number,"payment_frequency"?: string,"rate_bps"?: number,"schedule"?: Json | null,"start_balance_cents"?: number,"user_id": string
                  }
                  Update: {
                    "balance_cents"?: number,"closed_at"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"name"?: string,"next_due"?: string | null,"payment_cents"?: number,"payment_frequency"?: string,"rate_bps"?: number,"schedule"?: Json | null,"start_balance_cents"?: number,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"email_log": {
                  Row: {
                    "id": string,"kind": string,"ref": string,"sent_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"kind": string,"ref": string,"sent_at"?: string,"user_id": string
                  }
                  Update: {
                    "id"?: string,"kind"?: string,"ref"?: string,"sent_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"entitlements": {
                  Row: {
                    "access_until": string | null,"billing_interval": string | null,"cancel_at_period_end": boolean,"payment_failed_at": string | null,"pro_until": string | null,"state": string,"stripe_customer_id": string | null,"stripe_status": string | null,"stripe_subscription_id": string | null,"trial_ends_at": string | null,"trial_used": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_until"?: string | null,"billing_interval"?: string | null,"cancel_at_period_end"?: boolean,"payment_failed_at"?: string | null,"pro_until"?: string | null,"state"?: string,"stripe_customer_id"?: string | null,"stripe_status"?: string | null,"stripe_subscription_id"?: string | null,"trial_ends_at"?: string | null,"trial_used"?: boolean,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "access_until"?: string | null,"billing_interval"?: string | null,"cancel_at_period_end"?: boolean,"payment_failed_at"?: string | null,"pro_until"?: string | null,"state"?: string,"stripe_customer_id"?: string | null,"stripe_status"?: string | null,"stripe_subscription_id"?: string | null,"trial_ends_at"?: string | null,"trial_used"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"faqs": {
                  Row: {
                    "answer": string,"id": string,"locale": string,"published": boolean,"question": string,"sort": number,"topic": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"id"?: string,"locale"?: string,"published"?: boolean,"question": string,"sort"?: number,"topic"?: string
                  }
                  Update: {
                    "answer"?: string,"id"?: string,"locale"?: string,"published"?: boolean,"question"?: string,"sort"?: number,"topic"?: string
                  }
                  Relationships: [
                    
                  ]
                },"forecast_scenarios": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"id": string,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"name": string,"user_id": string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"goal_entries": {
                  Row: {
                    "amount_cents": number,"created_at": string,"date": string,"goal_id": string,"id": string,"note": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"date": string,"goal_id": string,"id"?: string,"note"?: string,"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"date"?: string,"goal_id"?: string,"id"?: string,"note"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goal_entries_goal_id_fkey"
      columns: ["goal_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    }
                  ]
                },"goals": {
                  Row: {
                    "account_id": string | null,"archived_at": string | null,"completed_at": string | null,"created_at": string,"id": string,"is_emergency_fund": boolean,"kind": string,"name": string,"target_cents": number,"target_date": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"archived_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"is_emergency_fund"?: boolean,"kind"?: string,"name": string,"target_cents"?: number,"target_date"?: string | null,"user_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"archived_at"?: string | null,"completed_at"?: string | null,"created_at"?: string,"id"?: string,"is_emergency_fund"?: boolean,"kind"?: string,"name"?: string,"target_cents"?: number,"target_date"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "goals_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "group_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "group_id": string,"user_id": string
                  }
                  Update: {
                    "group_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"note": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"note"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"note"?: string
                  }
                  Relationships: [
                    
                  ]
                },"investment_entries": {
                  Row: {
                    "amount_cents": number,"created_at": string,"date": string,"id": string,"investment_id": string,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"date": string,"id"?: string,"investment_id": string,"kind": string,"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"date"?: string,"id"?: string,"investment_id"?: string,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "investment_entries_investment_id_fkey"
      columns: ["investment_id"]
isOneToOne: false
      referencedRelation: "investments"
      referencedColumns: ["id"]
    }
                  ]
                },"investments": {
                  Row: {
                    "archived_at": string | null,"contributed_cents": number,"created_at": string,"id": string,"kind": string,"name": string,"platform": string,"user_id": string,"value_cents": number,"value_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"contributed_cents"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"name"?: string,"platform": string,"user_id": string,"value_cents"?: number,"value_date"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"contributed_cents"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"name"?: string,"platform"?: string,"user_id"?: string,"value_cents"?: number,"value_date"?: string
                  }
                  Relationships: [
                    
                  ]
                },"invite_codes": {
                  Row: {
                    "active": boolean,"code": string,"created_at": string,"group_id": string | null,"kind": string,"max_uses": number | null,"months": number | null,"until": string | null,"uses": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"created_at"?: string,"group_id"?: string | null,"kind"?: string,"max_uses"?: number | null,"months"?: number | null,"until"?: string | null,"uses"?: number
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"created_at"?: string,"group_id"?: string | null,"kind"?: string,"max_uses"?: number | null,"months"?: number | null,"until"?: string | null,"uses"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "invite_codes_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_comments": {
                  Row: {
                    "author_name": string,"body": string,"created_at": string,"hidden_at": string | null,"id": string,"lesson_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_name"?: string,"body": string,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"lesson_id": string,"user_id": string
                  }
                  Update: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"hidden_at"?: string | null,"id"?: string,"lesson_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_comments_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_media": {
                  Row: {
                    "lesson_id": string,"video_url": string
                  }
                  ComputedFields: never
                  Insert: {
                    "lesson_id": string,"video_url"?: string
                  }
                  Update: {
                    "lesson_id"?: string,"video_url"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_media_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: true
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lesson_progress": {
                  Row: {
                    "completed_at": string,"lesson_id": string,"rating": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string,"lesson_id": string,"rating"?: number | null,"user_id": string
                  }
                  Update: {
                    "completed_at"?: string,"lesson_id"?: string,"rating"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_progress_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "course_id": string,"cta_screen": string | null,"description": string,"duration_sec": number,"id": string,"module_id": string | null,"points": number,"required": boolean,"sort": number,"tier": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "course_id": string,"cta_screen"?: string | null,"description"?: string,"duration_sec"?: number,"id"?: string,"module_id"?: string | null,"points"?: number,"required"?: boolean,"sort"?: number,"tier"?: string,"title": string
                  }
                  Update: {
                    "course_id"?: string,"cta_screen"?: string | null,"description"?: string,"duration_sec"?: number,"id"?: string,"module_id"?: string | null,"points"?: number,"required"?: boolean,"sort"?: number,"tier"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_course_id_fkey"
      columns: ["course_id"]
isOneToOne: false
      referencedRelation: "courses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lessons_module_id_fkey"
      columns: ["module_id"]
isOneToOne: false
      referencedRelation: "course_modules"
      referencedColumns: ["id"]
    }
                  ]
                },"mfa_attempts": {
                  Row: {
                    "failed": number,"locked_until": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "failed"?: number,"locked_until"?: string | null,"user_id": string
                  }
                  Update: {
                    "failed"?: number,"locked_until"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"mfa_backup_codes": {
                  Row: {
                    "code_hash": string,"created_at": string,"id": string,"used_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code_hash": string,"created_at"?: string,"id"?: string,"used_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "code_hash"?: string,"created_at"?: string,"id"?: string,"used_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"month_closures": {
                  Row: {
                    "closed_at": string,"month": number,"reopened_at": string | null,"snapshot": NonNullable<Json>,"user_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string,"month": number,"reopened_at"?: string | null,"snapshot"?: NonNullable<Json>,"user_id": string,"year": number
                  }
                  Update: {
                    "closed_at"?: string,"month"?: number,"reopened_at"?: string | null,"snapshot"?: NonNullable<Json>,"user_id"?: string,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"month_totals": {
                  Row: {
                    "amount_cents": number,"category_id": string,"month": number,"user_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number,"category_id": string,"month": number,"user_id": string,"year": number
                  }
                  Update: {
                    "amount_cents"?: number,"category_id"?: string,"month"?: number,"user_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "month_totals_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"dedupe": string | null,"href": string | null,"id": string,"kind": string,"read_at": string | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"dedupe"?: string | null,"href"?: string | null,"id"?: string,"kind": string,"read_at"?: string | null,"title": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"dedupe"?: string | null,"href"?: string | null,"id"?: string,"kind"?: string,"read_at"?: string | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"plan_cells": {
                  Row: {
                    "amount_cents": number,"line_id": string,"manual": boolean,"month": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number,"line_id": string,"manual"?: boolean,"month": number,"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"line_id"?: string,"manual"?: boolean,"month"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_cells_line_id_fkey"
      columns: ["line_id"]
isOneToOne: false
      referencedRelation: "plan_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_lines": {
                  Row: {
                    "amount_cents": number,"archived_at": string | null,"category_id": string,"created_at": string,"debt_id": string | null,"first_pay_date": string | null,"frequency": string,"goal_id": string | null,"id": string,"investment_id": string | null,"kind": string,"name": string,"sort": number,"user_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number,"archived_at"?: string | null,"category_id": string,"created_at"?: string,"debt_id"?: string | null,"first_pay_date"?: string | null,"frequency"?: string,"goal_id"?: string | null,"id"?: string,"investment_id"?: string | null,"kind": string,"name": string,"sort"?: number,"user_id": string,"year": number
                  }
                  Update: {
                    "amount_cents"?: number,"archived_at"?: string | null,"category_id"?: string,"created_at"?: string,"debt_id"?: string | null,"first_pay_date"?: string | null,"frequency"?: string,"goal_id"?: string | null,"id"?: string,"investment_id"?: string | null,"kind"?: string,"name"?: string,"sort"?: number,"user_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_lines_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_lines_debt_id_fkey"
      columns: ["debt_id"]
isOneToOne: false
      referencedRelation: "debts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_lines_goal_id_fkey"
      columns: ["goal_id"]
isOneToOne: false
      referencedRelation: "goals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_lines_investment_id_fkey"
      columns: ["investment_id"]
isOneToOne: false
      referencedRelation: "investments"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_marks": {
                  Row: {
                    "line_id": string,"marked_at": string,"month": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "line_id": string,"marked_at"?: string,"month": number,"user_id": string
                  }
                  Update: {
                    "line_id"?: string,"marked_at"?: string,"month"?: number,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_marks_line_id_fkey"
      columns: ["line_id"]
isOneToOne: false
      referencedRelation: "plan_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_years": {
                  Row: {
                    "copied_from": number | null,"created_at": string,"user_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "copied_from"?: number | null,"created_at"?: string,"user_id": string,"year": number
                  }
                  Update: {
                    "copied_from"?: number | null,"created_at"?: string,"user_id"?: string,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"point_events": {
                  Row: {
                    "at": string,"id": string,"kind": string,"points": number,"ref": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: string,"kind": string,"points": number,"ref": string,"user_id": string
                  }
                  Update: {
                    "at"?: string,"id"?: string,"kind"?: string,"points"?: number,"ref"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"price_regions": {
                  Row: {
                    "currency": string,"monthly_cents": number | null,"region": string,"stripe_price_monthly": string | null,"stripe_price_yearly": string | null,"student_discount_pct": number,"yearly_cents": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "currency": string,"monthly_cents"?: number | null,"region": string,"stripe_price_monthly"?: string | null,"stripe_price_yearly"?: string | null,"student_discount_pct"?: number,"yearly_cents"?: number | null
                  }
                  Update: {
                    "currency"?: string,"monthly_cents"?: number | null,"region"?: string,"stripe_price_monthly"?: string | null,"stripe_price_yearly"?: string | null,"student_discount_pct"?: number,"yearly_cents"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"privacy_requests": {
                  Row: {
                    "done_at": string | null,"due_at": string,"id": string,"kind": string,"requested_at": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "done_at"?: string | null,"due_at"?: string,"id"?: string,"kind": string,"requested_at"?: string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "done_at"?: string | null,"due_at"?: string,"id"?: string,"kind"?: string,"requested_at"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"product_events": {
                  Row: {
                    "at": string,"id": number,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"id"?: never,"name": string,"user_id": string
                  }
                  Update: {
                    "at"?: string,"id"?: never,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "country": string,"created_at": string,"currency": string,"email": string,"first_steps": NonNullable<Json>,"id": string,"last_active_at": string | null,"last_name": string,"locale": string,"mov_level": string,"name": string,"onboarding_step": string,"password_changed_at": string | null,"pay_frequency": string,"phone": string,"prefs": NonNullable<Json>,"role": string,"suspended_at": string | null,"terms": NonNullable<Json>,"timezone": string,"wizard": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "country"?: string,"created_at"?: string,"currency"?: string,"email": string,"first_steps"?: NonNullable<Json>,"id": string,"last_active_at"?: string | null,"last_name"?: string,"locale"?: string,"mov_level"?: string,"name"?: string,"onboarding_step"?: string,"password_changed_at"?: string | null,"pay_frequency"?: string,"phone"?: string,"prefs"?: NonNullable<Json>,"role"?: string,"suspended_at"?: string | null,"terms"?: NonNullable<Json>,"timezone"?: string,"wizard"?: NonNullable<Json>
                  }
                  Update: {
                    "country"?: string,"created_at"?: string,"currency"?: string,"email"?: string,"first_steps"?: NonNullable<Json>,"id"?: string,"last_active_at"?: string | null,"last_name"?: string,"locale"?: string,"mov_level"?: string,"name"?: string,"onboarding_step"?: string,"password_changed_at"?: string | null,"pay_frequency"?: string,"phone"?: string,"prefs"?: NonNullable<Json>,"role"?: string,"suspended_at"?: string | null,"terms"?: NonNullable<Json>,"timezone"?: string,"wizard"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"push_subscriptions": {
                  Row: {
                    "created_at": string,"endpoint": string,"id": string,"keys": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"endpoint": string,"id"?: string,"keys": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"endpoint"?: string,"id"?: string,"keys"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recurring": {
                  Row: {
                    "account_id": string | null,"active": boolean,"amount_cents": number,"anchor_day": number | null,"category_id": string | null,"created_at": string,"description": string,"frequency": string,"id": string,"next_date": string,"plan_line_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"active"?: boolean,"amount_cents": number,"anchor_day"?: number | null,"category_id"?: string | null,"created_at"?: string,"description": string,"frequency": string,"id"?: string,"next_date": string,"plan_line_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"active"?: boolean,"amount_cents"?: number,"anchor_day"?: number | null,"category_id"?: string | null,"created_at"?: string,"description"?: string,"frequency"?: string,"id"?: string,"next_date"?: string,"plan_line_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_plan_line_id_fkey"
      columns: ["plan_line_id"]
isOneToOne: false
      referencedRelation: "plan_lines"
      referencedColumns: ["id"]
    }
                  ]
                },"support_tickets": {
                  Row: {
                    "created_at": string,"id": string,"status": string,"subject": string,"tech": NonNullable<Json>,"topic": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"status"?: string,"subject": string,"tech"?: NonNullable<Json>,"topic"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"status"?: string,"subject"?: string,"tech"?: NonNullable<Json>,"topic"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tax_entries": {
                  Row: {
                    "amount_cents": number,"created_at": string,"date": string,"id": string,"kind": string,"note": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents": number,"created_at"?: string,"date": string,"id"?: string,"kind": string,"note"?: string,"user_id": string
                  }
                  Update: {
                    "amount_cents"?: number,"created_at"?: string,"date"?: string,"id"?: string,"kind"?: string,"note"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tax_settings": {
                  Row: {
                    "account_id": string | null,"company_enabled": boolean,"enabled": boolean,"percent_bps": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"company_enabled"?: boolean,"enabled"?: boolean,"percent_bps"?: number,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"company_enabled"?: boolean,"enabled"?: boolean,"percent_bps"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tax_settings_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    }
                  ]
                },"ticket_messages": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"from_admin": boolean,"id": string,"ticket_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"from_admin"?: boolean,"id"?: string,"ticket_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"from_admin"?: boolean,"id"?: string,"ticket_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ticket_messages_ticket_id_fkey"
      columns: ["ticket_id"]
isOneToOne: false
      referencedRelation: "support_tickets"
      referencedColumns: ["id"]
    }
                  ]
                },"transaction_history": {
                  Row: {
                    "action": string,"after": Json | null,"at": string,"before": Json | null,"id": string,"transaction_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: string,"transaction_id": string,"user_id": string
                  }
                  Update: {
                    "action"?: string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: string,"transaction_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"transactions": {
                  Row: {
                    "account_id": string | null,"amount_cents": number,"category_id": string | null,"created_at": string,"date": string,"deleted_at": string | null,"description": string,"edited_at": string | null,"id": string,"import_id": string | null,"is_split": boolean,"kind": string,"note": string,"parent_id": string | null,"plan_line_id": string | null,"raw_description": string,"recurring_id": string | null,"source": string,"status": string,"transfer_pair_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id"?: string | null,"amount_cents": number,"category_id"?: string | null,"created_at"?: string,"date": string,"deleted_at"?: string | null,"description"?: string,"edited_at"?: string | null,"id"?: string,"import_id"?: string | null,"is_split"?: boolean,"kind"?: string,"note"?: string,"parent_id"?: string | null,"plan_line_id"?: string | null,"raw_description"?: string,"recurring_id"?: string | null,"source"?: string,"status"?: string,"transfer_pair_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "account_id"?: string | null,"amount_cents"?: number,"category_id"?: string | null,"created_at"?: string,"date"?: string,"deleted_at"?: string | null,"description"?: string,"edited_at"?: string | null,"id"?: string,"import_id"?: string | null,"is_split"?: boolean,"kind"?: string,"note"?: string,"parent_id"?: string | null,"plan_line_id"?: string | null,"raw_description"?: string,"recurring_id"?: string | null,"source"?: string,"status"?: string,"transfer_pair_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "accounts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_import_id_fkey"
      columns: ["import_id"]
isOneToOne: false
      referencedRelation: "csv_imports"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_plan_line_id_fkey"
      columns: ["plan_line_id"]
isOneToOne: false
      referencedRelation: "plan_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_recurring_id_fkey"
      columns: ["recurring_id"]
isOneToOne: false
      referencedRelation: "recurring"
      referencedColumns: ["id"]
    }
                  ]
                },"user_badges": {
                  Row: {
                    "badge": string,"earned_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "badge": string,"earned_at"?: string,"user_id": string
                  }
                  Update: {
                    "badge"?: string,"earned_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"watched_merchants": {
                  Row: {
                    "created_at": string,"id": string,"limit_cents": number | null,"name": string,"pattern": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"limit_cents"?: number | null,"name": string,"pattern": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"limit_cents"?: number | null,"name"?: string,"pattern"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_grant_access":
{ Args: { "p_expires": string,"p_group"?: string,"p_kind": string,"p_user": string }; Returns: undefined
                           },
"admin_log":
{ Args: { "p_action": string,"p_detail": Json,"p_target": string }; Returns: undefined
                           },
"admin_revoke_access":
{ Args: { "p_user": string }; Returns: undefined
                           },
"admin_set_role":
{ Args: { "p_role": string,"p_user": string }; Returns: undefined
                           },
"admin_set_suspended":
{ Args: { "p_on": boolean,"p_user": string }; Returns: undefined
                           },
"admin_summary":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"admin_user":
{ Args: { "p_user": string }; Returns: Json
                           },
"admin_users":
{ Args: { "p_filter"?: string,"p_limit"?: number,"p_offset"?: number,"p_search"?: string }; Returns: {
              "access_until": string,"country": string,"created_at": string,"email": string,"groups": (string)[],"id": string,"last_active_at": string,"name": string,"payment_failed_at": string,"pro_until": string,"role": string,"state": string,"suspended_at": string,"total": number
            }[]
                           },
"award_badge":
{ Args: { "p_badge": string }; Returns: boolean
                           },
"award_points":
{ Args: { "p_kind": string,"p_ref": string }; Returns: number
                           },
"can_write":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"course_live":
{ Args: { "p_course": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_tier":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"notify_me":
{ Args: { "p_body": string,"p_dedupe": string,"p_href": string,"p_kind": string,"p_title": string }; Returns: undefined
                           },
"redeem_invite":
{ Args: { "p_code": string }; Returns: string
                           },
"touch_week":
{ Args: { "p_week_start": string }; Returns: undefined
                           },
"use_wildcard":
{ Args: { "p_week_start": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
