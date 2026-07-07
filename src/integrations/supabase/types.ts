export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      availability_settings: {
        Row: {
          id: string;
          weekly_hours: Json;
          breaks: Json;
          slot_interval: number;
          buffer_minutes: number;
          max_per_day: number | null;
          closed_dates: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          weekly_hours?: Json;
          breaks?: Json;
          slot_interval?: number;
          buffer_minutes?: number;
          max_per_day?: number | null;
          closed_dates?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          weekly_hours?: Json;
          breaks?: Json;
          slot_interval?: number;
          buffer_minutes?: number;
          max_per_day?: number | null;
          closed_dates?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          appointment_date: string;
          appointment_time: string;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          id: string;
          notes: string | null;
          service_id: string;
          status: Database["public"]["Enums"]["appointment_status"];
          total_price: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          appointment_date: string;
          appointment_time: string;
          created_at?: string;
          customer_name: string;
          customer_phone: string;
          id?: string;
          notes?: string | null;
          service_id: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          total_price?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          appointment_date?: string;
          appointment_time?: string;
          created_at?: string;
          customer_name?: string;
          customer_phone?: string;
          id?: string;
          notes?: string | null;
          service_id?: string;
          status?: Database["public"]["Enums"]["appointment_status"];
          total_price?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_service_id_fkey";
            columns: ["service_id"];
            isOneToOne: false;
            referencedRelation: "services";
            referencedColumns: ["id"];
          },
        ];
      };
      business_settings: {
        Row: {
          about_image_url: string | null;
          address: string | null;
          business_name: string;
          google_maps_url: string | null;
          hero_image_url: string | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          phone: string | null;
          products_hero_image_url: string | null;
          updated_at: string;
          whatsapp_number: string | null;
        };
        Insert: {
          about_image_url?: string | null;
          address?: string | null;
          business_name?: string;
          google_maps_url?: string | null;
          hero_image_url?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          phone?: string | null;
          products_hero_image_url?: string | null;
          updated_at?: string;
          whatsapp_number?: string | null;
        };
        Update: {
          about_image_url?: string | null;
          address?: string | null;
          business_name?: string;
          google_maps_url?: string | null;
          hero_image_url?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          phone?: string | null;
          products_hero_image_url?: string | null;
          updated_at?: string;
          whatsapp_number?: string | null;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          total_price: number;
          unit_price: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity?: number;
          total_price: number;
          unit_price: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          total_price?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          completed_at: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_method: string;
          id: string;
          notes: string | null;
          order_number: string;
          payment_method: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          customer_name: string;
          customer_phone: string;
          delivery_method?: string;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_method?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          customer_name?: string;
          customer_phone?: string;
          delivery_method?: string;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_method?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          total?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          id: string;
          image_url: string;
          product_id: string;
          sort_order: number;
        };
        Insert: {
          id?: string;
          image_url: string;
          product_id: string;
          sort_order?: number;
        };
        Update: {
          id?: string;
          image_url?: string;
          product_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          description_ar: string | null;
          description_en: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          low_stock_threshold: number;
          name: string;
          name_ar: string | null;
          name_en: string | null;
          price: number;
          skin_type: string | null;
          stock_quantity: number;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          description?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          low_stock_threshold?: number;
          name: string;
          name_ar?: string | null;
          name_en?: string | null;
          price?: number;
          skin_type?: string | null;
          stock_quantity?: number;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          low_stock_threshold?: number;
          name?: string;
          name_ar?: string | null;
          name_en?: string | null;
          price?: number;
          skin_type?: string | null;
          stock_quantity?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          email_verified: boolean;
          full_name: string | null;
          id: string;
          phone: string | null;
          role: Database["public"]["Enums"]["app_role"];
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          email_verified?: boolean;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          email_verified?: boolean;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      verification_otps: {
        Row: {
          id: string;
          email: string;
          otp_hash: string;
          attempt_count: number;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          otp_hash: string;
          attempt_count?: number;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          otp_hash?: string;
          attempt_count?: number;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      signup_verification_tokens: {
        Row: {
          id: string;
          email: string;
          token_hash: string;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          token_hash: string;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          token_hash?: string;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          category: string;
          created_at: string;
          description: string | null;
          description_ar: string | null;
          description_en: string | null;
          duration_minutes: number;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          name_ar: string | null;
          name_en: string | null;
          price: number;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          description?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          duration_minutes?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name: string;
          name_ar?: string | null;
          name_en?: string | null;
          price?: number;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          description?: string | null;
          description_ar?: string | null;
          description_en?: string | null;
          duration_minutes?: number;
          id?: string;
          image_url?: string | null;
          is_active?: boolean;
          name?: string;
          name_ar?: string | null;
          name_en?: string | null;
          price?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      create_order: {
        Args: {
          p_user_id: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_notes: string | null;
          p_delivery_method: string;
          p_items: Json;
        };
        Returns: string;
      };
      create_appointment: {
        Args: {
          p_user_id: string;
          p_service_id: string;
          p_appointment_date: string;
          p_appointment_time: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_notes: string | null;
        };
        Returns: string;
      };
      reschedule_appointment: {
        Args: {
          p_user_id: string;
          p_appointment_id: string;
          p_service_id: string;
          p_appointment_date: string;
          p_appointment_time: string;
        };
        Returns: string;
      };
    };
    Enums: {
      app_role: "customer" | "admin";
      appointment_status: "pending" | "confirmed" | "completed" | "cancelled";
      order_status: "pending" | "confirmed" | "preparing" | "completed" | "cancelled";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "admin"],
      appointment_status: ["pending", "confirmed", "completed", "cancelled"],
      order_status: ["pending", "confirmed", "preparing", "completed", "cancelled"],
    },
  },
} as const;
