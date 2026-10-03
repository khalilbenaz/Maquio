import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import screens.Connexion
import screens.Accueil

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = "connexion") {
        composable("connexion") { Connexion(navController) }
        composable("accueil") { Accueil(navController) }
    }
}
