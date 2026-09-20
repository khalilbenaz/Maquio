package screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun LoginScreen() {
    Column(
        modifier = Modifier
            .size(width = 393.dp, height = 852.dp)
            .background(Color(0xFFFFFFFF)) // white
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.Start,
    ) {
        Text(
            "Bienvenue",
            style = TextStyle(
                fontSize = 28.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color(0xFF000000), // black
            ),
        )
        Box(
            modifier = Modifier
                .size(width = 345.dp, height = 48.dp)
                .background(Color(0xFFF2F2F5), RoundedCornerShape(12.dp))
                .border(1.dp, Color(0xFFD9D9DE), RoundedCornerShape(12.dp)),
        )
        Box(
            modifier = Modifier
                .size(width = 345.dp, height = 48.dp)
                .background(Color(0xFFF2F2F5), RoundedCornerShape(12.dp))
                .border(1.dp, Color(0xFFD9D9DE), RoundedCornerShape(12.dp)),
        )
        Row(
            modifier = Modifier
                .size(width = 345.dp, height = 48.dp)
                .background(Color(0xFF3366E6), RoundedCornerShape(12.dp)), // primary
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Se connecter",
                style = TextStyle(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFFFFFFFF), // white
                ),
            )
        }
    }
}
