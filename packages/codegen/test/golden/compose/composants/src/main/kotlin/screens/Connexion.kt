package screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Connexion(navController: NavController) {
    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Connexion") },
                actions = {
                    IconButton(onClick = {}) { Icon(Icons.Default.Search, contentDescription = null) }
                },
            )
        },
        containerColor = Color(0xFFFFFFFF),
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            OutlinedTextField(
                value = "",
                onValueChange = {},
                modifier = Modifier.width(361.dp),
                label = { Text("E-mail") },
                placeholder = { Text("nom@exemple.fr") },
                leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                singleLine = true,
            )
            OutlinedTextField(
                value = "",
                onValueChange = {},
                modifier = Modifier.width(361.dp),
                label = { Text("Mot de passe") },
                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
            )
            Row(
                modifier = Modifier.size(width = 361.dp, height = 48.dp).offset(x = 16.dp, y = 224.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Se souvenir de moi")
                Switch(checked = true, onCheckedChange = null)
            }
            Button(
                onClick = { navController.navigate("accueil") },
                modifier = Modifier.size(width = 361.dp, height = 48.dp).offset(x = 16.dp, y = 284.dp),
            ) {
                Text("Se connecter")
            }
            TextButton(
                onClick = {},
                modifier = Modifier.size(width = 361.dp, height = 44.dp).offset(x = 16.dp, y = 344.dp),
            ) {
                Text("Mot de passe oublié")
            }
        }
    }
}
