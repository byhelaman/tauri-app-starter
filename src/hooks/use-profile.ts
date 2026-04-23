import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"
import { toast } from "sonner"

export function useProfile() {
    const queryClient = useQueryClient()

    const { data: profile, isLoading } = useQuery({
        queryKey: ["profile"],
        queryFn: async () => {
            if (!supabase) return null
            const { data, error } = await supabase.rpc("get_my_profile")
            if (error) throw error
            return data as { display_name: string | null }
        }
    })

    const updateDisplayName = useMutation({
        mutationFn: async (newName: string) => {
            if (!supabase) return
            const { error } = await supabase.rpc("update_my_display_name", {
                new_display_name: newName.trim(),
            })
            if (error) throw error
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["profile"] })
            toast.success("Profile updated")
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to update profile")
        }
    })

    return {
        profile,
        isLoading,
        actions: {
            updateDisplayName: updateDisplayName.mutate,
            isUpdating: updateDisplayName.isPending
        }
    }
}
