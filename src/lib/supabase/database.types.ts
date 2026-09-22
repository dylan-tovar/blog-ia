// Mirrors supabase/migrations/*.sql. Regenerate once the CLI is linked:
//   supabase gen types typescript --linked --schema public

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PostStatus = "draft" | "pending_review" | "published" | "rejected";
export type PostType = "note" | "article";
export type NotificationType = "follow" | "like" | "note";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          username: string;
          avatar_url: string | null;
          created_at: string;
          onboarded_at: string | null;
          notify_new_article_email: boolean;
          unsubscribe_token: string;
        };
        Insert: {
          id: string;
          display_name: string;
          username: string;
          avatar_url?: string | null;
          created_at?: string;
          onboarded_at?: string | null;
          notify_new_article_email?: boolean;
          unsubscribe_token?: string;
        };
        Update: {
          id?: string;
          display_name?: string;
          username?: string;
          avatar_url?: string | null;
          created_at?: string;
          onboarded_at?: string | null;
          notify_new_article_email?: boolean;
          unsubscribe_token?: string;
        };
        Relationships: [];
      };
      posts: {
        Row: {
          id: string;
          author_id: string;
          type: PostType;
          parent_post_id: string | null;
          reply_to_post_id: string | null;
          title: string | null;
          content: string;
          status: PostStatus;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
          published_at: string | null;
          ai_generated_summary: string | null;
          ai_generated_titles: Json | null;
          content_score: Json | null;
          cover_image_url: string | null;
          cover_text: string | null;
          cover_color: string | null;
        };
        Insert: {
          id?: string;
          author_id: string;
          type?: PostType;
          parent_post_id?: string | null;
          reply_to_post_id?: string | null;
          title?: string | null;
          content?: string;
          status?: PostStatus;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          published_at?: string | null;
          ai_generated_summary?: string | null;
          ai_generated_titles?: Json | null;
          content_score?: Json | null;
          cover_image_url?: string | null;
          cover_text?: string | null;
          cover_color?: string | null;
        };
        Update: {
          id?: string;
          author_id?: string;
          type?: PostType;
          parent_post_id?: string | null;
          reply_to_post_id?: string | null;
          title?: string | null;
          content?: string;
          status?: PostStatus;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
          published_at?: string | null;
          ai_generated_summary?: string | null;
          ai_generated_titles?: Json | null;
          content_score?: Json | null;
          cover_image_url?: string | null;
          cover_text?: string | null;
          cover_color?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_parent_post_id_fkey";
            columns: ["parent_post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "posts_reply_to_post_id_fkey";
            columns: ["reply_to_post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          id: string;
          name: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      post_tags: {
        Row: {
          post_id: string;
          tag_id: string;
        };
        Insert: {
          post_id: string;
          tag_id: string;
        };
        Update: {
          post_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "post_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          follower_id: string;
          author_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          follower_id: string;
          author_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          follower_id?: string;
          author_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reading_history: {
        Row: {
          id: string;
          user_id: string;
          post_id: string;
          read_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          post_id: string;
          read_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          post_id?: string;
          read_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reading_history_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reading_history_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      likes: {
        Row: {
          id: string;
          user_id: string;
          post_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          post_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          post_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      user_interests: {
        Row: {
          user_id: string;
          tag_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          tag_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          tag_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_interests_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_interests_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          recipient_id: string;
          actor_id: string;
          type: NotificationType;
          post_id: string | null;
          note_id: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recipient_id: string;
          actor_id: string;
          type: NotificationType;
          post_id?: string | null;
          note_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recipient_id?: string;
          actor_id?: string;
          type?: NotificationType;
          post_id?: string | null;
          note_id?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_note_id_fkey";
            columns: ["note_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ai_rate_limit_hit: {
        Args: { p_user_key: string; p_user_limit: number; p_global_limit: number; p_global_key?: string };
        Returns: { allowed: boolean; scope: string | null; retry_after: number }[];
      };
      follower_emails_for_author: {
        Args: { p_author_id: string };
        Returns: { follower_id: string; email: string | null; unsubscribe_token: string }[];
      };
      login_email_for_username: {
        Args: { p_username: string };
        Returns: string | null;
      };
      popular_tags: {
        Args: { p_limit?: number };
        Returns: { id: string; name: string; uses: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
